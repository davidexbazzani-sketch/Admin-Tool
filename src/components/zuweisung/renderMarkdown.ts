// Kleiner, in sich geschlossener Markdown→HTML-Renderer für die Zuweisungs-Doku.
// Angelehnt an KnowledgeSearch.renderMarkdown, erweitert um GEORDNETE Listen (1./2.)
// und horizontale Linien (---). Inhalt ist gebündelt/vertraut (keine DOMPurify nötig).

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inline(s: string): string {
  let t = esc(s)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  return t
}
function tableRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map(c => c.trim())
}
const isSep = (l: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const isRow = (l: string): boolean => l.trim().startsWith('|')

export function renderMarkdown(md: string): string {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  const n = lines.length
  while (i < n) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    // Horizontale Linie
    if (/^\s*---+\s*$/.test(line)) { out.push('<hr/>'); i++; continue }

    // Überschriften
    const h = /^(#{1,6})\s+(.*)$/.exec(line)
    if (h) { const lvl = Math.min(6, h[1].length); out.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`); i++; continue }

    // Tabelle (Kopfzeile + Trennzeile)
    if (isRow(line) && i + 1 < n && isSep(lines[i + 1])) {
      const head = tableRow(line)
      out.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>')
      i += 2
      while (i < n && isRow(lines[i])) {
        const cells = tableRow(lines[i])
        out.push('<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>')
        i++
      }
      out.push('</tbody></table>')
      continue
    }

    // Geordnete Liste
    if (/^\s*\d+\.\s+/.test(line)) {
      out.push('<ol>')
      while (i < n && /^\s*\d+\.\s+/.test(lines[i])) { out.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`); i++ }
      out.push('</ol>')
      continue
    }
    // Ungeordnete Liste
    if (/^\s*[-*]\s+/.test(line)) {
      out.push('<ul>')
      while (i < n && /^\s*[-*]\s+/.test(lines[i])) { out.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`); i++ }
      out.push('</ul>')
      continue
    }
    // Blockzitat
    if (/^\s*>\s?/.test(line)) {
      const parts: string[] = []
      while (i < n && /^\s*>\s?/.test(lines[i])) { parts.push(inline(lines[i].replace(/^\s*>\s?/, ''))); i++ }
      out.push(`<blockquote>${parts.join('<br/>')}</blockquote>`)
      continue
    }

    // Absatz (bis Leerzeile / Blockanfang)
    const para: string[] = []
    while (i < n && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) && !isRow(lines[i]) && !/^\s*---+\s*$/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i])) {
      para.push(inline(lines[i])); i++
    }
    out.push(`<p>${para.join('<br/>')}</p>`)
  }
  return out.join('\n')
}
