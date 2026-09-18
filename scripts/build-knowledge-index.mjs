#!/usr/bin/env node
/**
 * build-knowledge-index.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Zerlegt die Wissens-Markdown-Dateien in durchsuchbare Chunks, extrahiert
 * Entitäten (Ticketnummern, Hostnamen, Personen, …) und schreibt zwei Bundles:
 *
 *   knowledge.core.json       — redaktionelles Wissen, unbedenklich
 *   knowledge.sensitive.json  — Rohdaten mit Personenbezug (optional laden)
 *
 * Aufruf:
 *   node scripts/build-knowledge-index.mjs --config config/knowledge.config.json
 *   node scripts/build-knowledge-index.mjs --config … --watch     (bei Änderung neu bauen)
 *
 * Läuft mit reinem Node ab v18, keine Abhängigkeiten, kein Netzwerk.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, watch, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILDER_VERSION = '1.0.0';
const __dirname = dirname(fileURLToPath(import.meta.url));

/* ───────────────────────────── CLI ───────────────────────────── */

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const configPath = resolve(getArg('config', join(__dirname, '..', 'config', 'knowledge.config.json')));
const watchMode = args.includes('--watch');
const quiet = args.includes('--quiet');

const log = (...m) => { if (!quiet) console.log(...m); };

/* ────────────────────── Entitäts-Erkennung ────────────────────── */

/**
 * Jede Regel liefert Treffer eines Typs. `norm` erzeugt den Schlüssel,
 * `display` die Anzeigeform. Reihenfolge = Priorität bei Überschneidung.
 */
const ENTITY_RULES = [
  {
    type: 'ticket', typeLabel: 'Ticket / Vorgang',
    rx: /\b(?:INC|CHG|CTASK|RITM|REQ|TASK|TSK|DMND|IDEA|PRB|ITEN|KB|IPT|APM|SNSVC|IU)\d{3,}\b/g,
  },
  { type: 'ticket', typeLabel: 'HP-Servicecase', rx: /\bCS0\d{5,}\b/g },
  { type: 'cve', typeLabel: 'Schwachstelle (CVE)', rx: /\bCVE-\d{4}-\d{4,}\b/g },
  { type: 'network', typeLabel: 'Switch / Access Point', rx: /\bskfl-[a-z]+-deham-[\w-]+\b/gi },
  { type: 'network', typeLabel: 'Orange-Asset', rx: /\b[AKP]ZMB\d{3,}\b/g },
  { type: 'host', typeLabel: 'Server / VM', rx: /\b[WX]\d{4}\b/g },
  { type: 'host', typeLabel: 'Client-Gerät', rx: /\bDE(?:HAM)?[A-Z0-9]{8,}\b/g },
  { type: 'printer', typeLabel: 'Drucker', rx: /\bPMD\d{3}\b/g },
  { type: 'ip', typeLabel: 'IP-Adresse', rx: /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g },
  { type: 'email', typeLabel: 'E-Mail-Adresse', rx: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'serial', typeLabel: 'Seriennummer', rx: /\b(?:[0-9][A-Z]{2}|[A-Z]{3})[0-9A-Z]{7}\b/g },
  { type: 'phone', typeLabel: 'Durchwahl', rx: /(?<![\d-])-1\d{3}\b/g },
];

/** Wörter, die fälschlich als Seriennummer/Host durchgehen würden. */
const ENTITY_BLOCKLIST = new Set([
  'DEUTSCHLAND', 'DEZEMBER', 'DETAILS', 'DEHAM', 'DEFAULT',
  'CHG0000000', 'INC0000000',
]);

function extractEntities(text) {
  const found = new Map(); // key -> {display, type, typeLabel}
  for (const rule of ENTITY_RULES) {
    rule.rx.lastIndex = 0;
    let m;
    while ((m = rule.rx.exec(text)) !== null) {
      const raw = m[0];
      if (ENTITY_BLOCKLIST.has(raw.toUpperCase())) continue;
      // IP-Plausibilität: keine Oktette > 255 (fängt Versionsnummern ab)
      if (rule.type === 'ip') {
        const parts = raw.split('/')[0].split('.').map(Number);
        if (parts.some((p) => p > 255)) continue;
      }
      const key = raw.toLowerCase();
      if (!found.has(key)) found.set(key, { display: raw, type: rule.type, typeLabel: rule.typeLabel });
    }
  }
  return found;
}

/* ─────────────────── Personen aus Kontakttabellen ─────────────────── */

/**
 * Erkennt Kontakttabellen ( | Name | … | E-Mail | ) und leitet daraus
 * Personen-Entitäten mit Rollen-Hinweis ab. Das macht die Suche nach
 * "Bipul" oder "Warmuth" deutlich besser als reine Volltextsuche.
 */
function extractPeopleFromTable(tableMd) {
  const lines = tableMd.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  const header = splitRow(lines[0]).map((c) => c.toLowerCase());
  const nameCol = header.findIndex((c) => /^(name|person|wer)\b/.test(c));
  if (nameCol < 0) return [];
  const roleCol = header.findIndex((c) => /(rolle|funktion|firma|zuständig|schwerpunkt)/.test(c));

  const people = [];
  for (const line of lines.slice(2)) {
    const cells = splitRow(line);
    if (cells.length <= nameCol) continue;
    const nameCell = cleanCell(cells[nameCol]);
    if (!nameCell || nameCell.length < 3) continue;
    // Mehrfachnennungen "A / B" oder "A, B" auftrennen
    for (const name of nameCell.split(/\s*(?:\/|,| und )\s*/)) {
      const n = name.trim();
      // plausibler Personenname: mindestens zwei Wörter, Großbuchstabe am Anfang
      if (!/^[A-ZÄÖÜ][\wäöüß.'-]+(?:\s+[A-ZÄÖÜ][\wäöüß.'-]+)+$/.test(n)) continue;
      const hint = roleCol >= 0 && cells[roleCol] ? cleanCell(cells[roleCol]).slice(0, 90) : undefined;
      people.push({ display: n, hint });
      // Nachname allein ebenfalls als Suchschlüssel
      const last = n.split(/\s+/).pop();
      if (last && last.length > 3) people.push({ display: last, hint: n + (hint ? ` — ${hint}` : ''), alias: true });
    }
  }
  return people;
}

/**
 * Leitet aus EINER Tabellenzeile eine Person ab, wenn die Tabelle eine
 * Kontakt-/Zustaendigkeitstabelle ist. Liefert Voll- und Nachnamen als
 * Suchschluessel, damit "Bipul" genauso trifft wie "Vikrant Bipul".
 */
function peopleFromRow(header, cells) {
  const h = header.map((c) => (c || '').toLowerCase());
  const nameCol = h.findIndex((c) => /^(name|person|wer)\b/.test(c));
  if (nameCol < 0 || !cells[nameCol]) return [];
  const roleCol = h.findIndex((c) => /(rolle|firma|funktion|zust\u00e4ndig|schwerpunkt)/.test(c));
  const mailCol = h.findIndex((c) => /(mail|e-mail)/.test(c));
  const role = roleCol >= 0 ? (cells[roleCol] || '') : '';
  const mail = mailCol >= 0 ? (cells[mailCol] || '') : '';
  const hintBase = [role, mail].filter(Boolean).join(' · ').slice(0, 110);

  const out = [];
  for (const part of cells[nameCol].split(/\s*(?:\/|,| und )\s*/)) {
    const n = part.trim();
    if (!/^[A-Z\u00c4\u00d6\u00dc][\w\u00e4\u00f6\u00fc\u00df.'-]+(?:\s+[A-Z\u00c4\u00d6\u00dc][\w\u00e4\u00f6\u00fc\u00df.'-]+)+$/.test(n)) continue;
    out.push({ display: n, hint: hintBase || undefined });
    const last = n.split(/\s+/).pop();
    if (last && last.length > 3) {
      out.push({ display: last, hint: `${n}${hintBase ? ' — ' + hintBase : ''}` });
    }
  }
  return out;
}

const splitRow = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
const cleanCell = (c) => (c ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();

/* ────────────────────── Markdown-Zerlegung ────────────────────── */

/** Entfernt Markdown-Auszeichnung (Spiegel von germanText.stripMarkdown). */
function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^[\s:|-]{4,}$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Ordnet einer Überschrift einen Chunk-Typ zu. */
function classify(headingChain) {
  const h = headingChain.join(' › ').toLowerCase();
  if (/überblick|overview|einleitung/.test(h)) return 'overview';
  if (/kernwissen|kernaussagen/.test(h)) return 'knowledge';
  if (/kontakt|zuständigkeit|wer macht was|personen-index/.test(h)) return 'contact';
  if (/offene|laufende|vorgänge/.test(h)) return 'open';
  if (/thread-register|register/.test(h)) return 'thread';
  return 'section';
}

/** Maximale Chunk-Größe, bevor an fetten Zwischenüberschriften weiter geteilt wird. */
const MAX_CHUNK = 3800;

/**
 * Zerlegt eine kuratierte Markdown-Datei in Chunks.
 * Strategie: an H2/H3 schneiden; zu große Blöcke an **Fett-Zwischenüberschriften**
 * nachteilen; Nachschlagetabellen zusätzlich zeilenweise indexieren.
 */
function chunkCurated(md, source) {
  const lines = md.split('\n');
  const chunks = [];
  let h1 = source.label;
  let chain = [];
  let buf = [];
  let bufStart = 0;
  let inFence = false;

  const flush = (endLine) => {
    const raw = buf.join('\n').trim();
    buf = [];
    if (!raw) return;
    const type = classify(chain);
    const title = chain[chain.length - 1] ?? h1;
    const path = [h1, ...chain];
    pushChunk(chunks, source, { path, title, type, md: raw, line: bufStart + 1 });
  };

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const hm = !inFence && /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) {
      flush(i);
      const level = hm[1].length;
      const text = hm[2].replace(/\*\*/g, '').trim();
      if (level === 1) { h1 = text; chain = []; }
      else {
        chain = chain.slice(0, level - 2);
        chain.push(text);
      }
      bufStart = i;
      return;
    }
    if (!buf.length) bufStart = i;
    buf.push(line);
  });
  flush(lines.length);

  return chunks;
}

/** Legt einen Chunk an — teilt zu große Blöcke und splittet Tabellen zeilenweise. */
function pushChunk(chunks, source, c) {
  const tableBlocks = [...c.md.matchAll(/(?:^\|.*\|\s*$\n?){3,}/gm)].map((m) => m[0]);

  // 1) Große Blöcke an fetten Zwischenüberschriften teilen
  if (c.md.length > MAX_CHUNK && /^\*\*[^*]+\*\*\s*$/m.test(c.md)) {
    const parts = c.md.split(/\n(?=\*\*[^*\n]+\*\*\s*$)/m);
    if (parts.length > 1) {
      parts.forEach((p) => {
        const sub = /^\*\*([^*\n]+)\*\*/.exec(p.trim());
        emit(chunks, source, {
          ...c,
          title: sub ? sub[1].trim() : c.title,
          path: sub ? [...c.path, sub[1].trim()] : c.path,
          md: p.trim(),
        });
      });
      // Tabellenzeilen trotzdem separat indexieren
      tableBlocks.forEach((tb) => emitTableRows(chunks, source, c, tb));
      return;
    }
  }

  // Reine Tabellen-Chunks: Zeilen einzeln indexieren, Elternblock auf den
  // Einleitungstext kuerzen. Sonst liegt dieselbe Tabelle doppelt im Index
  // und erzeugt einen riesigen, unbrauchbaren Treffer.
  const tableChars = tableBlocks.reduce((n, tb) => n + tb.length, 0);
  const rowsWillBeEmitted = tableBlocks.some(
    (tb) => tb.split('\n').filter((l) => l.trim().startsWith('|')).length >= 4
  );
  if (rowsWillBeEmitted && tableChars > 0.6 * c.md.length) {
    let lead = c.md;
    for (const tb of tableBlocks) lead = lead.replace(tb, '');
    lead = lead.trim();
    if (lead.replace(/\s/g, '').length >= 12) {
      emit(chunks, source, { ...c, md: lead });
    }
  } else {
    emit(chunks, source, c);
  }
  tableBlocks.forEach((tb) => emitTableRows(chunks, source, c, tb));
}

/** Indexiert jede Zeile einer Nachschlagetabelle als eigenen Treffer. */
function emitTableRows(chunks, source, parent, tableMd) {
  const lines = tableMd.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 4) return;                     // zu klein, lohnt nicht
  const header = splitRow(lines[0]).map(cleanCell);
  const body = lines.slice(2);
  if (body.length > 4000) return;                   // Sicherheitsnetz
  body.forEach((line, i) => {
    const cells = splitRow(line).map(cleanCell);
    if (!cells.some((c) => c)) return;
    const key = cells[0] || cells[1] || '';
    if (!key) return;
    const pairs = header.map((h, j) => (cells[j] ? `${h}: ${cells[j]}` : '')).filter(Boolean);
    emit(chunks, source, {
      path: [...parent.path, key],
      title: key,
      type: 'row',
      md: `**${key}**\n\n` + pairs.map((p) => `- ${p}`).join('\n'),
      line: parent.line + i,
      rowText: pairs.join(' · '),
      people: peopleFromRow(header, cells),
    });
  });
}

let seq = 0;
function emit(chunks, source, c) {
  const text = c.rowText ?? stripMarkdown(c.md);
  if (text.replace(/\s/g, '').length < 12) return;   // leere/triviale Blöcke überspringen
  const ents = extractEntities(c.md + ' ' + c.path.join(' '));
  chunks.push({
    id: `${source.id}#${String(seq++).padStart(5, '0')}`,
    sourceId: source.id,
    path: c.path,
    title: c.title,
    type: c.type,
    text,
    md: c.md,
    entities: [...ents.keys()],
    line: c.line,
    _ents: ents,
    _people: c.people ?? extractPeopleFromTable(c.md),
  });
}

/* ────────────────────────── Hauptlauf ────────────────────────── */

function build() {
  const t0 = Date.now();
  if (!existsSync(configPath)) {
    console.error(`Konfiguration nicht gefunden: ${configPath}`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const baseDir = resolve(dirname(configPath), config.baseDir ?? '.');
  const outDir = resolve(dirname(configPath), config.outDir ?? './knowledge');
  mkdirSync(outDir, { recursive: true });

  const bundles = {
    core: { chunks: [], entities: new Map(), sources: [] },
    sensitive: { chunks: [], entities: new Map(), sources: [] },
  };

  let missing = 0;
  for (const src of config.sources) {
    const file = resolve(baseDir, src.file);
    if (!existsSync(file)) {
      console.warn(`  ! übersprungen (nicht gefunden): ${src.file}`);
      missing++;
      continue;
    }
    const md = readFileSync(file, 'utf8');
    seq = 0;
    const chunks = chunkCurated(md, src);
    const target = src.sensitive ? bundles.sensitive : bundles.core;

    for (const ch of chunks) {
      // Entitäten einsammeln
      for (const [key, info] of ch._ents) {
        const e = target.entities.get(key) ?? {
          key, display: info.display, type: info.type, typeLabel: info.typeLabel,
          chunkIds: [], count: 0,
        };
        e.chunkIds.push(ch.id);
        e.count++;
        target.entities.set(key, e);
      }
      // Personen aus Kontakttabellen
      for (const p of ch._people ?? []) {
        const key = p.display.toLowerCase();
        const e = target.entities.get(key) ?? {
          key, display: p.display, type: 'person', typeLabel: 'Person',
          chunkIds: [], count: 0, hint: p.hint,
        };
        if (!e.hint && p.hint) e.hint = p.hint;
        if (!e.chunkIds.includes(ch.id)) { e.chunkIds.push(ch.id); e.count++; }
        target.entities.set(key, e);
      }
      delete ch._ents; delete ch._people;
      target.chunks.push(ch);
    }
    target.sources.push(src);
    log(`  ✓ ${src.label.padEnd(24)} ${String(chunks.length).padStart(5)} Chunks   (${src.file})`);
  }

  const written = [];
  for (const [name, b] of Object.entries(bundles)) {
    if (!b.chunks.length) continue;
    const entities = [...b.entities.values()]
      .filter((e) => e.count >= (name === 'sensitive' ? 1 : 1))
      .sort((a, b2) => b2.count - a.count);
    const bundle = {
      meta: {
        builtAt: new Date().toISOString(),
        builderVersion: BUILDER_VERSION,
        sources: b.sources,
        chunkCount: b.chunks.length,
        entityCount: entities.length,
      },
      chunks: b.chunks,
      entities,
    };
    const out = join(outDir, `knowledge.${name}.json`);
    writeFileSync(out, JSON.stringify(bundle), 'utf8');
    const kb = (statSync(out).size / 1024).toFixed(0);
    written.push({ name, out, chunks: b.chunks.length, entities: entities.length, kb });
  }

  log('');
  for (const w of written) {
    log(`  → ${basename(w.out).padEnd(26)} ${String(w.chunks).padStart(5)} Chunks · ${String(w.entities).padStart(5)} Entitäten · ${w.kb} KB`);
  }
  log(`\n  Fertig in ${Date.now() - t0} ms${missing ? ` (${missing} Quelle(n) fehlten)` : ''}\n`);
  return { config, baseDir };
}

log(`\nWissensindex bauen — ${configPath}\n`);
const { config, baseDir } = build();

if (watchMode) {
  log('  Beobachte Quelldateien … (Strg+C zum Beenden)\n');
  let timer = null;
  for (const src of config.sources) {
    const file = resolve(baseDir, src.file);
    if (!existsSync(file)) continue;
    watch(file, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        log(`  Änderung erkannt: ${src.file} — neu bauen …`);
        try { build(); } catch (e) { console.error('  Fehler:', e.message); }
      }, 400);
    });
  }
}
