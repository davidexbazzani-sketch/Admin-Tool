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

  if (!d || d.ok === false) {
    push({ id: 'scan-fehler', titel: 'Netzwerk-Scan fehlgeschlagen', gewicht: 'INFO', ist: d?.fehler || '—', soll: '—',
      wirkung: 'Der Ziel-PC konnte nicht vollständig ausgelesen werden (offline, WinRM oder Rechte).',
      fundort: 'Get-NetAdapter', kategorie: 'info', fixbar: false })
    return out
  }

  // ══════════ WLAN-Analyse (nur wenn WLAN-Adapter vorhanden) ══════════
  if (d.adapter) {
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
    // 802.1X-/Sicherheits-Authentifizierung schlägt fehl (Event 11006 / 8002)
    const authFehler = ev.authFehler || 0
    if (authFehler >= 3) {
      push({ id: 'auth-8021x', titel: '802.1X-Authentifizierung schlägt fehl', gewicht: authFehler >= 8 ? 'HOCH' : 'MITTEL',
        ist: `${authFehler} Auth-Fehler${ev.connectFehler ? `, ${ev.connectFehler} Verbindungsfehler` : ''} in ${ev.tage} Tagen`, soll: 'möglichst 0',
        wirkung: 'Die WLAN-Sicherheits-/802.1X-Authentifizierung ist mehrfach fehlgeschlagen (Event 11006). Bei zertifikatsbasiertem Firmen-WLAN deutet das auf ein abgelaufenes/fehlendes Client-Zertifikat, RADIUS/NPS-Probleme oder eine fehlgeschlagene periodische Neu-Authentifizierung hin — der Client fliegt raus und verbindet oft NICHT automatisch neu (manuelles Neuverbinden nötig).',
        fundort: 'Microsoft-Windows-WLAN-AutoConfig/Operational (Event 11006/8002)',
        kategorie: 'netzwerk', fixbar: false, hinweis: 'Nicht im Tool behebbar — Client-Zertifikat (Gültigkeit/Auto-Enrollment), RADIUS/NPS-Logs und die WLAN-802.1X-Profileinstellungen prüfen.' })
    }
  }

  // 9) WLAN: nichts Auffälliges?
  if (!out.some(b => b.fixbar)) {
    push({ id: 'unauffaellig', titel: 'WLAN: keine offensichtliche Fehlkonfiguration', gewicht: 'INFO',
      ist: '—', soll: '—',
      wirkung: 'Die typischen WLAN-Fehleinstellungen sind hier nicht gesetzt. Zur Ursachenfindung Problem-PCs mit fehlerfreien Referenz-PCs vergleichen (Reiter „Vergleich"); der Roh-Daten-Anhang im PDF enthält alle Werte.',
      fundort: '—', kategorie: 'info', fixbar: false })
  }
  } // ══════════ Ende WLAN-Analyse ══════════
  for (const b of out) if (!b.verbindung) b.verbindung = 'WLAN'

  // ══════════ LAN-Analyse (nur wenn LAN-Adapter vorhanden) ══════════
  if (d.lan) {
    const lan = d.lan
    const lanBefore = out.length
    const lanAdv = (rx: RegExp): AdvProp | undefined => (d.lanAdvanced || []).find(p => rx.test(p.name || '') || rx.test(p.keyword || ''))
    const pushLan = (b: NetBefund) => out.push(withErkl({ ...b, verbindung: 'LAN' }))

    // Link-Speed unter 1 Gbit/s
    const speed = d.lanVerbindung?.linkSpeed || lan.linkSpeed || ''
    if (speed && /\b(10|100)\s*Mbps\b/i.test(speed) && !/Gbps/i.test(speed)) {
      pushLan({ id: 'lan-speed', titel: `LAN läuft nur mit ${speed}`, gewicht: 'HOCH', ist: speed, soll: '1 Gbit/s',
        wirkung: 'Ein Link mit 10/100 Mbit/s statt 1 Gbit/s deutet fast immer auf ein Kabel-/Port-/Duplex-Problem (defektes/zu langes Kabel, schlechte Dose, Duplex-Mismatch) hin — häufige Ursache für Aussetzer und Einbrüche.',
        fundort: 'Get-NetAdapter → LinkSpeed', kategorie: 'netzwerk', fixbar: false })
    }
    // Speed & Duplex fest (nicht Auto)
    const sd = lanAdv(/speed.*duplex|duplex/i)
    if (sd && sd.value && !/auto/i.test(sd.value)) {
      pushLan({ id: 'lan-duplex', titel: 'Speed & Duplex fest eingestellt (nicht Auto)', gewicht: 'HOCH', ist: sd.value, soll: 'Auto Negotiation',
        wirkung: 'Eine feste Speed/Duplex-Einstellung führt bei nicht exakt passendem Switch-Port zu Duplex-Mismatch → Kollisionen, Paketverlust, Abbrüche. Auto-Negotiation ist Standard.',
        fundort: `Adapter-Advanced → ${sd.name} (${sd.keyword})`, kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', adapter: 'lan', keyword: sd.keyword, displayName: sd.name, zielDisplay: 'Auto Negotiation' } })
    }
    // Energy-Efficient / Green Ethernet
    const eee = lanAdv(/energy.?efficient|green.?ethernet|\beee\b/i)
    if (eee && (/enab|on|^1$/i.test(eee.value || '') || (eee.regValue || '').trim() === '1')) {
      pushLan({ id: 'lan-eee', titel: 'Energy-Efficient Ethernet (EEE / Green Ethernet) aktiv', gewicht: 'HOCH', ist: eee.value || 'aktiviert', soll: 'deaktiviert',
        wirkung: 'EEE/Green Ethernet senkt den Stromverbrauch, verursacht aber mit manchen Switches sporadische kurze LAN-Aussetzer (Link-Flapping). Eine der häufigsten Ursachen für LAN-Verbindungsabbrüche.',
        fundort: `Adapter-Advanced → ${eee.name} (${eee.keyword})`, kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', adapter: 'lan', keyword: eee.keyword, displayName: eee.name, zielRegValue: '0', zielDisplay: 'Disabled' } })
    }
    // Geräte-Abschaltung (Energie)
    const lt = d.lanPowerMgmt?.allowTurnOff, lpnp = d.lanPowerMgmt?.pnpCapabilities
    if (lt === true || (lt == null && lpnp === 0)) {
      pushLan({ id: 'lan-turnoff', titel: 'LAN-Adapter darf zum Energiesparen abgeschaltet werden', gewicht: 'HOCH', ist: 'aktiviert', soll: 'deaktiviert',
        wirkung: '„Computer kann das Gerät ausschalten, um Energie zu sparen" ist gesetzt → Windows schaltet den Netzwerkadapter in Ruhephasen ab → LAN-Aussetzer.',
        fundort: 'Geräte-Manager → LAN-Adapter → Energieverwaltung (PnPCapabilities)', kategorie: 'netpower', fixbar: true, fix: { art: 'powermgmt', adapter: 'lan', powermgmt: 'disable-turnoff' } })
    }
    // Flow Control aus
    const fc = lanAdv(/flow.?control/i)
    if (fc && /disab|off|^0$/i.test(fc.value || '')) {
      pushLan({ id: 'lan-flow', titel: 'Flow Control deaktiviert', gewicht: 'GERING', standardAus: true, ist: fc.value || 'deaktiviert', soll: 'Rx & Tx aktiviert',
        wirkung: 'Ohne Flow Control kann es bei Lastspitzen zu Paketverlust kommen. Meist unkritisch, bei Abbrüchen aber einen Versuch wert.',
        fundort: `Adapter-Advanced → ${fc.name} (${fc.keyword})`, kategorie: 'netadv', fixbar: true, fix: { art: 'advanced', adapter: 'lan', keyword: fc.keyword, displayName: fc.name, zielDisplay: 'Rx & Tx Enabled' } })
    }
    // Fehler-/Discard-Zähler
    const st = d.lanStatistik
    if (st) {
      const errs = (st.rxErr || 0) + (st.txErr || 0), disc = (st.rxDisc || 0) + (st.txDisc || 0)
      if (errs > 0 || disc > 100) {
        pushLan({ id: 'lan-errors', titel: 'Paketfehler/Verwürfe auf dem LAN-Adapter', gewicht: errs > 0 ? 'HOCH' : 'MITTEL', ist: `Fehler: ${errs} · Verworfen: ${disc}`, soll: '0 Fehler',
          wirkung: 'Empfangs-/Sende-Fehler oder viele verworfene Pakete deuten auf ein physisches Problem (Kabel, Dose, Switch-Port, Duplex) — starke Abbruch-Ursache. Kabel/Port tauschen und erneut messen.',
          fundort: 'Get-NetAdapterStatistics', kategorie: 'netzwerk', fixbar: false })
      }
    }
    // Link-Down-Ereignisse
    const le = d.lanEreignisse
    if (le && le.disconnects > 0) {
      pushLan({ id: 'lan-events', titel: `LAN-Verbindung getrennt in ${le.tage} Tagen: ${le.disconnects}`, gewicht: le.disconnects >= 4 ? 'HOCH' : 'MITTEL', ist: `${le.disconnects} Trennungen, ${le.connects} Neuverbindungen`, soll: 'möglichst 0',
        wirkung: 'Das Netzwerkprofil-Protokoll belegt tatsächliche LAN-Trennungen. Zusammen mit EEE/Fehlerzählern/Kabel eingrenzen.',
        fundort: 'Microsoft-Windows-NetworkProfile/Operational (Event 10001)', kategorie: 'info', fixbar: false })
    }
    if (out.length === lanBefore) {
      pushLan({ id: 'lan-unauffaellig', titel: 'LAN: keine offensichtliche Fehlkonfiguration', gewicht: 'INFO', ist: '—', soll: '—',
        wirkung: 'Die typischen LAN-Fehleinstellungen (EEE, Duplex, Energie-Abschaltung) sind unauffällig. Bei Abbrüchen: Kabel/Dose/Switch-Port prüfen; Ping-Test & Fehlerzähler im Roh-Anhang ansehen.',
        fundort: '—', kategorie: 'info', fixbar: false })
    }
  }

  // ── Live-Ping-Test (Verlust/Latenz) je Verbindungsart ──
  for (const pt of (d.pingTests || [])) {
    const verb: 'WLAN' | 'LAN' = /wlan/i.test(pt.ziel) ? 'WLAN' : 'LAN'
    if (pt.verlust > 0) {
      out.push(withErkl({ id: `ping-loss-${verb}`, verbindung: verb, titel: `Paketverlust zum Gateway (${pt.ziel})`, gewicht: pt.verlust >= 20 ? 'HOCH' : 'MITTEL', ist: `Verlust: ${pt.verlust}%${pt.avg != null ? ` · Latenz ${pt.avg} ms` : ''}`, soll: '0 % Verlust',
        wirkung: 'Beim Live-Ping zum Standard-Gateway gingen Pakete verloren — konkreter Beleg für eine instabile Verbindung (Kabel/AP/Port/Treiber).',
        fundort: 'Test-Connection → Gateway', kategorie: 'netzwerk', fixbar: false }))
    } else if (pt.avg != null && pt.avg > 30) {
      out.push(withErkl({ id: `ping-lat-${verb}`, verbindung: verb, titel: `Hohe Latenz zum Gateway (${pt.ziel})`, gewicht: 'GERING', ist: `Latenz ${pt.avg} ms · Jitter ${pt.jitter ?? '—'} ms`, soll: '< 5 ms (LAN) / < 20 ms (WLAN)',
        wirkung: 'Erhöhte Latenz/Jitter zum eigenen Gateway deutet auf Last, Duplex- oder Funkprobleme.', fundort: 'Test-Connection → Gateway', kategorie: 'info', fixbar: false }))
    }
  }

  // Kein Adapter überhaupt?
  if (!d.adapter && !d.lan) {
    push({ id: 'kein-adapter', titel: 'Kein Netzwerkadapter erkannt', gewicht: 'INFO', ist: d?.fehler || '—', soll: '—',
      wirkung: 'Weder WLAN- noch LAN-Adapter aktiv/gefunden (deaktiviert oder Scan unvollständig).', fundort: 'Get-NetAdapter', kategorie: 'info', fixbar: false })
  }
  if (out.length === 0) {
    push({ id: 'unauffaellig', titel: 'Keine offensichtliche Fehlkonfiguration', gewicht: 'INFO', ist: '—', soll: '—',
      wirkung: 'Die typischen Fehleinstellungen sind nicht gesetzt. Der Roh-Daten-Anhang im PDF enthält alle Werte für die Tiefensuche.', fundort: '—', kategorie: 'info', fixbar: false })
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
