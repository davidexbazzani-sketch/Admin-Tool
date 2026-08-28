// ── SolidWorks-Diagnose: Sammel-Export (eine .md + .json über alle PCs) ───────
// Kapitel 2 (Sammelbefunde) und 3 (Kennwerte-Vergleich) sind der Kern: erst über
// mehrere PCs zeigt sich Einzel- vs. Flottenproblem.

import type { SwLauf, SwKennwerte } from './swCheck.types'

export interface ExportOptions { mitEinzelberichten: boolean }

function fmt(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE') }
function jn(v: unknown): string { return v === undefined || v === null || v === '' ? '—' : String(v) }
function ja(v: unknown): string { return v === true ? 'ja' : v === false ? 'nein' : '—' }

const K = (l: SwLauf): SwKennwerte => l.kennwerte ?? {}

export interface SwExportResult { md: string; json: unknown; name: string }

export function buildExport(laeufe: SwLauf[], opts: ExportOptions): SwExportResult {
  const now = new Date()
  const sorted = [...laeufe].sort((a, b) => a.pc.toLowerCase().localeCompare(b.pc.toLowerCase()))
  const zeiten = laeufe.map(l => l.ranAt).sort()
  const von = zeiten[0] ? fmt(zeiten[0]) : '—'
  const bis = zeiten[zeiten.length - 1] ? fmt(zeiten[zeiten.length - 1]) : '—'

  const L: string[] = []
  L.push(`# SolidWorks-Diagnose — Sammelbericht`)
  L.push(`Erzeugt am ${now.toLocaleString('de-DE')} · ${sorted.length} PCs · ${laeufe.length} Läufe · Zeitraum von ${von} bis ${bis}`, '')

  // ── 1. Übersicht ──
  L.push(`## 1. Übersicht`, '')
  L.push(`| PC | letzter Lauf | SOLIDWORKS-Version | angemeldeter Benutzer | Auffälligkeiten |`)
  L.push(`|---|---|---|---|---|`)
  for (const l of sorted) L.push(`| ${l.pc} | ${fmt(l.ranAt)} | ${jn(K(l).swVersion)} | ${jn(K(l).benutzer)} | ${l.auffaelligkeiten.length} |`)
  L.push('')

  // ── 2. Sammelbefunde ──
  const gruppen = new Map<string, string[]>()
  for (const l of sorted) for (const a of l.auffaelligkeiten) {
    const key = a.trim()
    if (!gruppen.has(key)) gruppen.set(key, [])
    if (!gruppen.get(key)!.includes(l.pc)) gruppen.get(key)!.push(l.pc)
  }
  const sammel = [...gruppen.entries()].map(([befund, pcs]) => ({ befund, pcs, anzahl: pcs.length })).sort((a, b) => b.anzahl - a.anzahl)
  L.push(`## 2. Sammelbefunde`, '')
  if (sammel.length === 0) L.push('_Keine Auffälligkeiten über alle PCs._', '')
  else {
    L.push(`| Befund | betroffene PCs | Anzahl |`)
    L.push(`|---|---|---|`)
    for (const s of sammel) L.push(`| ${s.befund} | ${s.pcs.join(', ')} | ${s.anzahl} |`)
    L.push('')
  }

  // ── 3. Vergleich der Kennwerte ──
  L.push(`## 3. Vergleich der Kennwerte`, '')
  L.push(`| PC | SW-Version | Toolbox | AutoRecover | Backup | Def. SW | Def. C:\\PortaX | Energieplan | Adapter-Energie | Latenz w3143 (ms) | C: frei (%) | GPU + Treiber | Uptime (Tage) | Abstürze 30 T |`)
  L.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`)
  for (const l of sorted) {
    const k = K(l)
    L.push(`| ${l.pc} | ${jn(k.swVersion)} | ${jn(k.toolboxPfad)} | ${jn(k.autoRecover)} | ${jn(k.backupPfad)} | ${ja(k.defenderSw)} | ${ja(k.defenderPortaX)} | ${jn(k.energieplan)} | ${jn(k.adapterEnergie)} | ${jn(k.latenzW3143)} | ${jn(k.cFreiPct)} | ${jn(k.gpu)} | ${jn(k.uptimeTage)} | ${jn(k.abstuerze30d)} |`)
  }
  L.push('')

  // ── 4. Serverbefunde ──
  L.push(`## 4. Serverbefunde`, '')
  const serverByHost = new Map<string, { text: string; auff: string[]; ranAt: string; von: string }>()
  for (const l of sorted) for (const s of l.skripte) {
    if (s.ziel !== 'server' || !s.ok) continue
    const host = String((s.daten?.Kennwerte as SwKennwerte | undefined)?.server ?? 'Server')
    const prev = serverByHost.get(host)
    if (!prev || prev.ranAt < l.ranAt) serverByHost.set(host, { text: s.textBericht, auff: s.daten?.Auffaelligkeiten ?? [], ranAt: l.ranAt, von: l.pc })
  }
  if (serverByHost.size === 0) L.push('_Kein Server-Skript in diesen Läufen._', '')
  else for (const [host, v] of serverByHost) {
    L.push(`### Server ${host}  (gemessen ${fmt(v.ranAt)} über ${v.von})`, '')
    if (v.auff.length) { L.push('Auffälligkeiten:'); for (const a of v.auff) L.push(`- ${a}`); L.push('') }
    L.push('```', v.text, '```', '')
  }

  // ── 5 ff. Einzelberichte ──
  if (opts.mitEinzelberichten) {
    let nr = 5
    for (const l of sorted) {
      L.push(`## ${nr}. ${l.pc}  (${fmt(l.ranAt)}, ${l.ranBy})`, '')
      if (l.auffaelligkeiten.length) { L.push('Auffälligkeiten:'); for (const a of l.auffaelligkeiten) L.push(`- ${a}`); L.push('') }
      for (const s of l.skripte) {
        L.push(`### ${s.titel}${s.ok ? '' : ' — FEHLER: ' + (s.fehler || '')}`, '')
        if (s.textBericht) L.push('```', s.textBericht, '```', '')
      }
      nr++
    }
  }

  // ── Anhang ──
  L.push(`## Anhang: Methodik`, '')
  L.push('- Skripte: SOLIDWORKS_Bestandsaufnahme.ps1 (Client), SOLIDWORKS_Server_W3143.ps1 (Server), Tool-Version 1.0.')
  L.push('- Streng lesend über WinRM. HKCU-Werte werden über HKU\\<SID> des angemeldeten Anwenders gelesen (bei nicht angemeldeten Benutzern NTUSER.DAT temporär geladen und wieder entladen).')
  L.push('- Netzwerkpfade werden vom Ziel-PC nur per DNS/ICMP/TCP445 gemessen (kein Doppelhop); Dateizugriff macht der Admin-PC.')
  L.push('- Seriennummern sind maskiert (nur Präfix). Kennwörter sind nicht enthalten.')
  L.push('')

  const md = L.join('\n')
  const json = {
    erzeugtAm: now.toISOString(),
    pcs: sorted.length, laeufe: laeufe.length, zeitraum: { von, bis },
    uebersicht: sorted.map(l => ({ pc: l.pc, ranAt: l.ranAt, swVersion: K(l).swVersion, benutzer: K(l).benutzer, auffaelligkeiten: l.auffaelligkeiten.length })),
    sammelbefunde: sammel,
    vergleich: sorted.map(l => ({ pc: l.pc, ...K(l) })),
    serverbefunde: [...serverByHost.entries()].map(([host, v]) => ({ host, ranAt: v.ranAt, auffaelligkeiten: v.auff })),
    ...(opts.mitEinzelberichten ? { einzelberichte: sorted.map(l => ({ pc: l.pc, ranAt: l.ranAt, skripte: l.skripte })) } : {}),
  }
  const name = `SolidWorks-Diagnose_${now.toISOString().slice(0, 10)}`
  return { md, json, name }
}
