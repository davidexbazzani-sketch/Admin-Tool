import { useMemo } from 'react'
import { renderMarkdown } from './renderMarkdown'

// Scoped Styles für das gerenderte Markdown (der Tailwind-Reset entfernt sonst
// Überschriften-/Listen-/Tabellen-Formatierung). Farben theme-neutral über rgba.
const CSS = `
.zuw-md h1{font-size:1.5rem;font-weight:700;margin:1.2rem 0 .6rem;line-height:1.2}
.zuw-md h2{font-size:1.2rem;font-weight:700;margin:1.4rem 0 .5rem;padding-bottom:.25rem;border-bottom:1px solid rgba(128,128,128,.25)}
.zuw-md h3{font-size:1.05rem;font-weight:600;margin:1rem 0 .4rem}
.zuw-md h4{font-size:.95rem;font-weight:600;margin:.8rem 0 .3rem}
.zuw-md p{margin:.5rem 0}
.zuw-md ul,.zuw-md ol{margin:.4rem 0 .6rem 1.4rem}
.zuw-md ul{list-style:disc}.zuw-md ol{list-style:decimal}
.zuw-md li{margin:.15rem 0}
.zuw-md code{font-family:Consolas,ui-monospace,monospace;font-size:.85em;background:rgba(128,128,128,.18);padding:.05rem .3rem;border-radius:.2rem}
.zuw-md strong{font-weight:700}
.zuw-md hr{border:0;border-top:1px solid rgba(128,128,128,.25);margin:1rem 0}
.zuw-md blockquote{border-left:3px solid rgba(128,128,128,.4);padding-left:.7rem;margin:.6rem 0;opacity:.85}
.zuw-md table{border-collapse:collapse;width:100%;margin:.6rem 0;font-size:.82rem;display:block;overflow-x:auto}
.zuw-md th,.zuw-md td{border:1px solid rgba(128,128,128,.25);padding:.3rem .5rem;text-align:left;vertical-align:top}
.zuw-md th{background:rgba(128,128,128,.12);font-weight:600;white-space:nowrap}
`

export default function MarkdownHilfe({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])
  return (
    <div className="max-w-[70rem] mx-auto">
      <style>{CSS}</style>
      <div className="zuw-md text-sm leading-relaxed text-foreground/90" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
