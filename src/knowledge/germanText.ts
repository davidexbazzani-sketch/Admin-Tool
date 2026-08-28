/**
 * Deutsche Textbehandlung für die Wissenssuche.
 *
 * Drei Probleme werden hier gelöst:
 *  1. Umlaute — "Völkl" und "Voelkl" müssen sich gegenseitig finden.
 *  2. Atomare Bezeichner — "INC2912083", "skfl-sw-deham-H8sl-01", "10.170.32.15"
 *     dürfen nicht in Bruchstücke zerlegt werden.
 *  3. Komposita — "Netzwerkstörung" soll auch bei der Suche nach "Netzwerk" gefunden werden.
 *
 * Diese Datei wird von Build-Skript UND Renderer benutzt: Index und Query müssen
 * exakt dieselbe Normalisierung verwenden, sonst findet die Suche nichts.
 */

/**
 * Muster für Bezeichner, die als EIN Token erhalten bleiben müssen.
 * Reihenfolge ist relevant: spezifischer vor allgemeiner.
 */
export const ATOMIC_PATTERN = new RegExp(
  [
    // Ticketnummern aller Systeme: INC2912083, CHG0079758, RITM1046297, ITEN0015990 …
    '\\b(?:INC|CHG|CTASK|RITM|REQ|TASK|TSK|DMND|IDEA|PRB|ITEN|KB|CS|IPT|APM|REQ)\\d{3,}\\b',
    // CVE-Kennungen
    '\\bCVE-\\d{4}-\\d{4,}\\b',
    // Netzwerkgeräte: skfl-sw-deham-H8sl-01, skfl-ap-deham-temp-08
    '\\bskfl-[a-z]+-deham-[\\w-]+\\b',
    // Orange-Asset-IDs: AZMB30346, KZMB30077, PZMB042
    '\\b[AKP]ZMB\\d{3,}\\b',
    // Server/VMs: W3137, X0360, W5627
    '\\b[WXwx]\\d{4}\\b',
    // Clientnamen: DE5CG4453Q1N, DEHAM5CG3443XWJ, DECZC439734L
    '\\bDE(?:HAM)?[A-Z0-9]{8,}\\b',
    // Drucker: PMD618, DEHAM020
    '\\bPMD\\d{3}\\b',
    // IPv4
    '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    // HP-Seriennummern: 5CG4423FCW, 1HF5431P9T, CND2203LWL, 8CC1140LQR, CZC5477JHG
    '\\b(?:[0-9][A-Z]{2}|[A-Z]{3})[0-9A-Z]{7}\\b',
    // SAP-Mandanten und Bereichskürzel: P57, T61, S514, KQS
    '\\b(?:[PTS]\\d{2,3}|S\\d{2,3}|K[A-Z]{1,3})\\b',
    // Durchwahlen: -1895
    '(?<![\\d])-1\\d{3}\\b',
  ].join('|'),
  'gi'
);

/** Wörter, die keinen Suchwert haben (deutsch + englisch, bewusst kurz gehalten). */
export const STOPWORDS = new Set([
  'der','die','das','den','dem','des','ein','eine','einen','einem','eines','einer',
  'und','oder','aber','doch','sondern','denn','als','wie','wenn','dass','ob',
  'ist','sind','war','waren','wird','werden','wurde','wurden','hat','haben','hatte',
  'sich','nicht','auch','noch','nur','schon','sehr','mehr','bei','mit','von','zum',
  'zur','für','auf','aus','durch','über','unter','nach','vor','ohne','gegen','bis',
  'the','and','for','with','from','this','that','are','was','were','has','have',
  'not','but','all','can','will','been','into','than','then','they','their',
]);

/** Synonyme und Schreibvarianten. Wird bei der SUCHE expandiert, nicht beim Indexieren. */
export const SYNONYMS: Record<string, string[]> = {
  wlan: ['wifi', 'wireless', 'wlan', 'funknetz'],
  wifi: ['wlan', 'wireless', 'wifi'],
  usv: ['ups', 'usv', 'notstrom'],
  ups: ['usv', 'ups'],
  drucker: ['printer', 'drucker', 'pmd', 'druck'],
  printer: ['drucker', 'printer'],
  mfa: ['mfa', 'authenticator', 'zweifaktor', 'multifactor'],
  authenticator: ['mfa', 'authenticator'],
  firewall: ['firewall', 'palo', 'algosec', 'panorama'],
  server: ['server', 'vm', 'host'],
  laptop: ['laptop', 'notebook', 'pc', 'client'],
  telefon: ['telefon', 'xelion', 'voip', 'durchwahl'],
  urlaub: ['urlaub', 'abwesenheit', 'freistellung'],
  zoll: ['zoll', 'dbh', 'atlas', 'customs', 'export'],
  backup: ['backup', 'sicherung', 'restore', 'avamar', 'datadomain'],
  netzwerk: ['netzwerk', 'network', 'lan', 'netz'],
  passwort: ['passwort', 'password', 'kennwort', 'anmeldung', 'login'],
  vertrag: ['vertrag', 'lizenz', 'subscription', 'wartungsvertrag'],
  serverraum: ['serverraum', 'rechenzentrum', 'rz', 'e15', 'e30'],
};

/**
 * Faltet einen Term in seine Suchvarianten.
 * "völkl" -> ["voelkl", "volkl"]  |  "strasse" -> ["strasse"]
 * Beide Varianten werden indexiert UND bei der Suche erzeugt, dadurch
 * findet "Voelkl" auch "Völkl" und umgekehrt.
 */
export function foldVariants(term: string): string[] {
  const lower = term.toLowerCase();
  const expanded = lower
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
  const stripped = lower
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
  return expanded === stripped ? [expanded] : [expanded, stripped];
}

/**
 * Zerlegt Text in Tokens. Atomare Bezeichner bleiben am Stück,
 * der Rest wird an Nicht-Buchstaben getrennt.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const atoms: string[] = [];
  const rest = text.replace(ATOMIC_PATTERN, (m) => {
    atoms.push(m);
    return ' ';
  });
  const words = rest.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  return [...atoms, ...words];
}

/**
 * Normalisierung eines einzelnen Tokens für den Index.
 * Gibt mehrere Varianten zurück (MiniSearch unterstützt Arrays in processTerm).
 * null = Token verwerfen.
 */
export function processTerm(term: string): string | string[] | null {
  const t = term.toLowerCase();
  if (t.length < 2) return null;
  if (STOPWORDS.has(t)) return null;
  return foldVariants(t);
}

/**
 * Expandiert einen Suchbegriff um Synonyme und Faltungsvarianten.
 * Synonyme MUESSEN Einzeltokens sein — ein Eintrag wie "zwei-faktor" zerfiele
 * beim Suchen in "zwei" + "faktor", und "zwei" kapert dann das Ranking.
 */
export function expandQueryTerm(term: string): string[] {
  const base = term.toLowerCase();
  const out = new Set<string>(foldVariants(base));
  for (const syn of SYNONYMS[base] ?? []) {
    if (/[^\p{L}\p{N}]/u.test(syn)) continue;   // Mehrwort-Synonyme verwerfen
    for (const v of foldVariants(syn)) out.add(v);
  }
  return [...out];
}

/** Liefert nur die Synonyme (ohne den Begriff selbst) — für die Trefferkennzeichnung. */
export function synonymsOf(term: string): string[] {
  const base = term.toLowerCase();
  const own = new Set(foldVariants(base));
  return (SYNONYMS[base] ?? [])
    .filter((s) => !/[^\p{L}\p{N}]/u.test(s))
    .flatMap(foldVariants)
    .filter((v) => !own.has(v));
}

/** Prüft, ob ein Suchbegriff wie ein atomarer Bezeichner aussieht (Ticket, Host, IP …). */
export function looksAtomic(term: string): boolean {
  ATOMIC_PATTERN.lastIndex = 0;
  const m = ATOMIC_PATTERN.exec(term);
  return !!m && m[0].length === term.length;
}

/** Entfernt Markdown-Auszeichnung, damit reiner Text durchsucht und angezeigt wird. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')          // Codeblöcke
    .replace(/`([^`]+)`/g, '$1')               // Inline-Code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // Bilder
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // Links -> Linktext
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // Überschriften
    .replace(/\*\*([^*]+)\*\*/g, '$1')         // fett
    .replace(/\*([^*]+)\*/g, '$1')             // kursiv
    .replace(/^\s*>\s?/gm, '')                 // Zitate
    .replace(/^\s*[-*+]\s+/gm, '')             // Listenpunkte
    .replace(/\|/g, ' ')                       // Tabellenstriche
    .replace(/^[\s:|-]{4,}$/gm, ' ')           // Tabellen-Trennzeilen
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Baut einen Textausschnitt um die erste Fundstelle und markiert die Treffer.
 * Gibt HTML-sicheren String mit <mark>-Tags zurück.
 */
export function buildSnippet(text: string, terms: string[], radius = 140): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (!terms.length) return esc(text.slice(0, radius * 2)) + (text.length > radius * 2 ? ' …' : '');

  const hay = text.toLowerCase();
  let best = -1;
  let bestTerm = '';
  for (const t of terms) {
    for (const v of foldVariants(t)) {
      const i = hay.indexOf(v);
      if (i >= 0 && (best < 0 || i < best)) { best = i; bestTerm = v; }
    }
    if (best === 0) break;
  }
  if (best < 0) {
    return esc(text.slice(0, radius * 2)) + (text.length > radius * 2 ? ' …' : '');
  }

  let start = Math.max(0, best - radius);
  let end = Math.min(text.length, best + bestTerm.length + radius);
  // an Wortgrenzen ausrichten
  if (start > 0) { const s = text.indexOf(' ', start); if (s > 0 && s < best) start = s + 1; }
  if (end < text.length) { const e = text.lastIndexOf(' ', end); if (e > best) end = e; }

  let out = esc(text.slice(start, end));
  const variants = [...new Set(terms.flatMap(foldVariants))]
    .filter((v) => v.length > 1)
    .sort((a, b) => b.length - a.length);
  for (const v of variants) {
    const rx = new RegExp(`(${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    out = out.replace(rx, '<mark>$1</mark>');
  }
  return (start > 0 ? '… ' : '') + out + (end < text.length ? ' …' : '');
}
