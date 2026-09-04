// ── Netzwerk-Diagnose: Analyse-Hirn ──────────────────────────────────────────
// Rohdaten (NetDaten) → Befunde (mit optionalem Fix + Erklärung) sowie die
// PC-übergreifende Vergleichsmatrix (Problem- vs. Referenz-PCs).

import { findeErklaerung } from './erklaerungen'
import type { NetDaten, NetLauf, NetBefund, AdvProp } from './types'

const PWR_NAME = ['Höchstleistung', 'Geringe Energieeinsparung', 'Mittlere Energieeinsparung', 'Maximale Energieeinsparung']
function pwrName(v?: number | null): string { return v == null ? 'unbekannt' : (PWR_NAME[v] ?? String(v)) }

function slug(s: string): string { return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) }

/** Advanced-Property per Name- oder Keyword-Regex finden. */
function adv(d: NetDaten, rx: RegExp): AdvProp | undefined {
  return (d.advanced || []).find(p => rx.test(p.name || '') || rx.test(p.keyword || ''))
}

function withErkl(b: NetBefund): NetBefund {
  if (!b.id) b.id = slug(b.titel)
  const e = findeErklaerung({ name: b.fix?.keyword, titel: b.titel, fundort: b.fundort })
  if (e) { b.erklaerung = e; if (!b.wirkung) b.wirkung = e.wirkung }
  return b
}

export function analysiere(lauf: NetLauf): NetBefund[] {
  const d = lauf.daten
  const out: NetBefund[] = []
  const push = (b: NetBefund) => out.push(withErkl(b))

  if (!d || d.ok === false || !d.adapter) {
    push({ id: 'kein-adapter', titel: 'Kein WLAN-Adapter gefunden', gewicht: 'INFO', ist: d?.fehler || '—', soll: '—',
      wirkung: 'Auf dem Ziel-PC wurde kein WLAN-Adapter erkannt (Gerät kabelgebunden, Adapter deaktiviert oder Scan unvollständig).',
      fundort: 'Get-NetAdapter', kategorie: 'info', fixbar: false })
    return out
  }
  const ad = d.adapter

  // 1) Energieplan: WLAN-Energiesparmodus (AC/DC) ≠ Höchstleistung
  const ac = d.powercfg?.wlanAc, dc = d.powercfg?.wlanDc
  if ((ac != null && ac > 0) || (dc != null && dc > 0)) {
    push({ id: 'powercfg-wlan', titel: 'WLAN-Energiesparmodus nicht auf Höchstleistung', gewicht: 'HOCH',
      ist: `Netzbetrieb: ${pwrName(ac)} · Akku: ${pwrName(dc)}`, soll: 'Netzbetrieb & Akku: Höchstleistung',
      wirkung: 'Windows drosselt den WLAN-Adapter im Sparmodus. Das ist die häufigste Ursache für sporadische, kurze Verbindungsabbrüche — besonders wenn kurz keine Daten fließen.',
      fundort: 'Energieplan → Drahtlosadaptereinstellungen → Energiesparmodus (powercfg)',
      kategorie: 'powercfg-wifi', fixbar: true, fix: { art: 'powercfg', powercfg: 'wlan-max' } })
  }

  // 2) Geräte-Energieverwaltung: „Computer kann Gerät ausschalten"
  const turnOff = d.powerMgmt?.allowTurnOff
  const pnp = d.powerMgmt?.pnpCapabilities
  if (turnOff === true || (turnOff == null && pnp === 0)) {
    push({ id: 'powermgmt-turnoff', titel: 'Adapter darf zum Energiesparen abgeschaltet werden', gewicht: 'HOCH',
      ist: 'aktiviert', soll: 'deaktiviert',
      wirkung: 'Im Geräte-Manager ist „Computer kann das Gerät ausschalten, um Energie zu sparen" gesetzt. Windows schaltet den Adapter in Ruhephasen ab → kurze WLAN-Aussetzer.',
      fundort: 'Geräte-Manager → WLAN-Adapter → Energieverwaltung (PnPCapabilities)',
      kategorie: 'netpower', fixbar: true, fix: { art: 'powermgmt', powermgmt: 'disable-turnoff' } })
  }

  // 3) Roaming-Aggressivität zu hoch
  const roam = adv(d, /roam/i)
  if (roam) {
    const hoch = /high|aggress|4|5/i.test(roam.value || '') || ['4', '5'].includes((roam.regValue || '').trim())
    if (hoch) push({ id: 'roaming-aggressiv', titel: 'Roaming-Aggressivität zu hoch', gewicht: 'MITTEL',
      ist: roam.value || roam.regValue, soll: 'Mittel',
      wirkung: 'Bei vielen Enterprise-Access-Points sucht der Adapter zu aggressiv nach einem „besseren" AP und trennt dabei kurz die Verbindung. Das erklärt vereinzelte Aussetzer, die nicht alle Kollegen gleichzeitig haben.',
      fundort: `Adapter-Advanced → ${roam.name} (${roam.keyword})`,
      kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', keyword: roam.keyword, displayName: roam.name, zielRegValue: '3', zielDisplay: 'Medium' } })
  }

  // 4) U-APSD aktiv (AP-Interop-Probleme)
  const uapsd = adv(d, /uapsd|u-?apsd/i)
  if (uapsd && (/enab|^1$/i.test(uapsd.value || '') || (uapsd.regValue || '').trim() === '1')) {
    push({ id: 'uapsd', titel: 'U-APSD (WMM-Stromsparen) aktiv', gewicht: 'MITTEL',
      ist: uapsd.value || 'aktiviert', soll: 'deaktiviert',
      wirkung: 'U-APSD spart Strom bei latenzarmem Verkehr, führt aber mit manchen Access-Point-Firmwares zu Verbindungsstörungen/Drops.',
      fundort: `Adapter-Advanced → ${uapsd.name} (${uapsd.keyword})`,
      kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', keyword: uapsd.keyword, displayName: uapsd.name, zielRegValue: '0', zielDisplay: 'Disabled' } })
  }

  // 5) Throughput Booster aktiv (optional)
  const boost = adv(d, /throughput.?booster/i)
  if (boost && (/enab|^1$/i.test(boost.value || '') || (boost.regValue || '').trim() === '1')) {
    push({ id: 'throughput-booster', titel: 'Throughput Booster aktiv', gewicht: 'GERING', standardAus: true,
      ist: boost.value || 'aktiviert', soll: 'deaktiviert',
      wirkung: 'Der Throughput Booster kann in dichten WLAN-Umgebungen die Stabilität verschlechtern; nur für Upload-lastige Sonderfälle sinnvoll.',
      fundort: `Adapter-Advanced → ${boost.name} (${boost.keyword})`,
      kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', keyword: boost.keyword, displayName: boost.name, zielRegValue: '0', zielDisplay: 'Disabled' } })
  }

  // 6) Intel BE200 (Wi-Fi 7) + MLO → bei Dauertrennungen 802.11ax erzwingen (opt-in)
  const isBe200 = /be200|wi-?fi\s*7|802\.11be/i.test(ad.ifDesc || '')
  const mlo = adv(d, /mlo|multi.?link/i)
  if (isBe200) {
    const mloAn = mlo && (/enab|auto|^1$/i.test(mlo.value || '') || (mlo.regValue || '').trim() !== '0')
    push({ id: 'be200-mlo', titel: 'Intel BE200 (Wi-Fi 7): MLO als mögliche Drop-Ursache', gewicht: mloAn ? 'MITTEL' : 'INFO', standardAus: true,
      ist: mlo ? `${mlo.name}: ${mlo.value}` : 'Wi-Fi 7 aktiv', soll: mloAn ? '802.11ax erzwingen / MLO aus' : 'beobachten',
      wirkung: 'Für die Intel BE200 ist ein bekannter Bug dokumentiert: bei aktiviertem Multi-Link-Betrieb (MLO) trennt der AP die Verbindung wiederholt. Abhilfe ist, den Adapter auf 802.11ax festzulegen bzw. MLO zu deaktivieren.',
      fundort: `Adapter-Advanced → ${mlo ? mlo.name + ' (' + mlo.keyword + ')' : 'Wireless Mode / MLO'}`,
      kategorie: mlo ? 'netadv' : 'info', fixbar: !!mlo,
      fix: mlo ? { art: 'advanced', keyword: mlo.keyword, displayName: mlo.name, zielRegValue: '0', zielDisplay: 'Disabled' } : undefined })
  }

  // 7) Treiberstand
  const dv = ad.driverVersion || ''
  const maj = parseInt((dv.split('.')[0] || '0'), 10)
  if (/intel/i.test(ad.ifDesc || '') && maj > 0 && maj < 23) {
    push({ id: 'treiber-alt', titel: 'WLAN-Treiber veraltet', gewicht: 'HOCH',
      ist: `${dv}${ad.driverDate ? ' (' + ad.driverDate + ')' : ''}`, soll: '≥ 23.30 (Intel)',
      wirkung: 'Frühe Intel-Treiber/Firmware (AX211/BE200) sind für sporadische WLAN-Trennungen unter Windows 11 bekannt. Empfohlen ist mindestens Version 23.30. Aktualisierung über den Menüpunkt „Treiber-Installation".',
      fundort: `Get-NetAdapter → DriverVersion (${ad.ifDesc})`,
      kategorie: 'treiber', fixbar: false, hinweis: 'Update läuft über „Treiber-Installation", nicht über diese Kachel.' })
  }

  // 8) Ereignis-Auswertung (Aussetzer-Historie)
  const ev = d.ereignisse
  if (ev) {
    if (ev.disconnects > 0) {
      const topGrund = ev.gruende[0]?.grund
      push({ id: 'ereignisse', titel: `WLAN-Aussetzer in ${ev.tage} Tagen: ${ev.disconnects}`, gewicht: ev.disconnects >= 8 ? 'MITTEL' : 'INFO',
        ist: `${ev.disconnects} Trennungen, ${ev.connects} Neuverbindungen`, soll: 'möglichst 0',
        wirkung: `Ereignisprotokoll WLAN-AutoConfig.${topGrund ? ' Häufigster Grund: „' + topGrund + '".' : ''} Diese Historie belegt, ob und wie oft es tatsächlich trennt.`,
        fundort: 'Microsoft-Windows-WLAN-AutoConfig/Operational (Event 8003)',
        kategorie: 'info', fixbar: false })
    }
    // BSSID-Cluster → eher netzseitig
    const top = ev.bssidCluster[0]
    if (top && ev.disconnects >= 4 && top.anzahl >= Math.ceil(ev.disconnects * 0.6)) {
      push({ id: 'bssid-cluster', titel: 'Aussetzer häufen sich an einem Access Point', gewicht: 'MITTEL',
        ist: `${top.anzahl} von ${ev.disconnects} Trennungen an BSSID ${top.bssid}`, soll: '—',
        wirkung: 'Ein Großteil der Trennungen betrifft denselben Access Point (BSSID). Das deutet eher auf ein netz-/AP-seitiges Problem (dieser AP, DFS-Kanal, AP-Firmware) als auf eine reine PC-Einstellung hin — bitte auch die Netzwerkseite/den AP prüfen.',
        fundort: `WLAN-AutoConfig Event 8003 · BSSID ${top.bssid}`,
        kategorie: 'netzwerk', fixbar: false })
    }
  }

  // 9) Nichts Auffälliges?
  if (!out.some(b => b.fixbar)) {
    push({ id: 'unauffaellig', titel: 'Keine offensichtliche Fehlkonfiguration', gewicht: 'INFO',
      ist: '—', soll: '—',
      wirkung: 'Die typischen WLAN-Fehleinstellungen sind hier nicht gesetzt. Zur Ursachenfindung mehrere Problem-PCs mit fehlerfreien Referenz-PCs vergleichen (Reiter „Vergleich") — Abweichungen bei Treiber/Advanced-Settings werden dort hervorgehoben.',
      fundort: '—', kategorie: 'info', fixbar: false })
  }

  const rank = { HOCH: 0, MITTEL: 1, GERING: 2, INFO: 3 }
  return out.sort((a, b) => (rank[a.gewicht] - rank[b.gewicht]) || (Number(b.fixbar) - Number(a.fixbar)))
}

// ── Vergleichsmatrix (Problem- vs. Referenz-PCs) ─────────────────────────────
export interface VergleichZeile {
  key: string
  label: string
  gruppe: string
  werte: Record<string, string>   // pc → Wert
  unterschiedlich: boolean        // nicht überall gleich
  auffaellig: boolean             // Problem-PCs haben einen Wert, den kein Referenz-PC hat
}

function normWert(s?: string | null): string { return (s ?? '').toString().trim() || '—' }

export function vergleiche(laeufe: NetLauf[]): VergleichZeile[] {
  const pcs = laeufe.map(l => l.pc)
  const rollen = new Map(laeufe.map(l => [l.pc, l.rolle]))
  const zeilen: VergleichZeile[] = []

  const add = (key: string, label: string, gruppe: string, get: (d: NetDaten) => string) => {
    const werte: Record<string, string> = {}
    for (const l of laeufe) werte[l.pc] = normWert(l.ok ? get(l.daten) : 'Scan-Fehler')
    const distinct = new Set(Object.values(werte))
    const problemV = new Set(laeufe.filter(l => rollen.get(l.pc) === 'problem').map(l => werte[l.pc]))
    const refV = new Set(laeufe.filter(l => rollen.get(l.pc) === 'referenz').map(l => werte[l.pc]))
    const auffaellig = refV.size > 0 && [...problemV].some(v => v !== '—' && !refV.has(v))
    zeilen.push({ key, label, gruppe, werte, unterschiedlich: distinct.size > 1, auffaellig })
  }

  // Stammwerte
  add('modell', 'Modell', 'System', d => d.system?.modell || d.adapter?.ifDesc || '')
  add('adapter', 'WLAN-Adapter', 'System', d => d.adapter?.ifDesc || '')
  add('driverVersion', 'Treiber-Version', 'Treiber', d => d.adapter?.driverVersion || '')
  add('driverDate', 'Treiber-Datum', 'Treiber', d => d.adapter?.driverDate || '')
  add('bios', 'BIOS-Version', 'System', d => d.system?.bios || '')
  add('os', 'Windows', 'System', d => d.system?.os || '')
  // Energie
  add('wlanAc', 'WLAN-Energiesparen (Netz)', 'Energie', d => pwrName(d.powercfg?.wlanAc))
  add('wlanDc', 'WLAN-Energiesparen (Akku)', 'Energie', d => pwrName(d.powercfg?.wlanDc))
  add('schema', 'Energieplan', 'Energie', d => d.powercfg?.schema || '')
  add('turnOff', 'Gerät abschaltbar (Energie)', 'Energie', d => d.powerMgmt?.allowTurnOff == null ? '—' : (d.powerMgmt.allowTurnOff ? 'ja' : 'nein'))
  add('modernStandby', 'Modern Standby (S0)', 'Energie', d => d.powercfg?.modernStandby == null ? '—' : (d.powercfg.modernStandby ? 'ja' : 'nein'))
  // Alle Advanced-Properties (Union über alle PCs)
  const advNames = new Map<string, string>()   // slug → Anzeigename
  for (const l of laeufe) for (const p of (l.daten.advanced || [])) if (p.name) advNames.set(slug(p.name), p.name)
  for (const [sl, name] of [...advNames.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'))) {
    add('adv-' + sl, name, 'Adapter-Einstellungen', d => {
      const p = (d.advanced || []).find(x => slug(x.name) === sl)
      return p ? (p.value || p.regValue || '') : '—'
    })
  }
  return zeilen
}
