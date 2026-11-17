// ── PC-Volldiagnose: Ursachenbild (bereichsübergreifend, reine Logik) ─────────
// Verbindet Befunde aus verschiedenen Bereichen zu einer Erklärung („Platte defekt → daher
// Bluescreens und beschädigte Systemdateien“). Die Hauptursache bekommt den ersten
// Lösungsweg; Folgefehler werden markiert; bei Hardware-Defekten werden Software-Reparaturen
// gesperrt (würden nichts nützen oder die Lage verschlimmern).

import type { VdBefund, VdPhase, VdUrsache } from './typen'

interface Regel {
  id: string
  titel: string
  /** Befund-Typen, die die Ursache belegen (mind. einer muss da sein) */
  beleg: (string | RegExp)[]
  /** zusätzlich nötig (mind. einer), sonst keine eigene Ursache */
  mitAuch?: (string | RegExp)[]
  /** Befunde, die sich damit erklären */
  erklaert: (string | RegExp)[]
  text: (b: VdBefund[]) => string
  sperrt?: VdPhase[]
  /** Diese Ursache muss vor allem anderen behoben werden (z. B. Neustart) */
  zuerst?: boolean
  gewicht: number
}

const passt = (typ: string, muster: (string | RegExp)[]) => muster.some(m => (typeof m === 'string' ? (m.endsWith('*') ? typ.startsWith(m.slice(0, -1)) : typ === m) : m.test(typ)))

const ABSTURZ = ['evt:bluescreen', 'evt:hart-aus', 'evt:absturz-bekannt', 'evt:absturz-sonstige', 'v1-unklar', 'v2-unklar', 'evt:lx-livekernel', 'evt:lx-livekernel-sonst']
const INTEGRITAET = ['integ-speicher-reparierbar', 'integ-speicher-nicht-reparierbar', 'integ-cbs-spuren', 'integ-checkhealth-fehler', 'v4-*', 'v1-systemdateien', 'v2-systemdll', 'srv-dism-auffaellig']

export const URSACHEN_REGELN: Regel[] = [
  { id: 'u-platte', titel: 'Der Datenträger ist defekt', gewicht: 100, beleg: ['v5-defekt'],
    erklaert: [...ABSTURZ, ...INTEGRITAET, 'evt:platte-intern', 'evt:lx-dateisystem', 'v1-datentraeger', 'v5-dateisystem', 'integ-wu-fehler', 'v3-*', 'evt:lx-sql-io'],
    text: () => 'Festplatte/SSD meldet einen Hardware-Defekt. Bluescreens, beschädigte Dateien und Update-Fehler sind sehr wahrscheinlich Folgen davon. Erst sichern und tauschen – Reparaturen (chkdsk, DISM, SFC) auf der sterbenden Platte beschleunigen den Ausfall.',
    sperrt: ['dateisystem', 'komponenten', 'systemdateien', 'updates'] },
  { id: 'u-hardware', titel: 'Hardwarefehler (Prozessor, Speicher oder Mainboard)', gewicht: 95, beleg: ['v1-hardware'],
    erklaert: [...ABSTURZ, 'evt:hardware-whea', 'v2-systemdll', 'v1-speicher'],
    text: () => 'Die Hardware meldet nicht korrigierbare Fehler. Software-Reparaturen helfen hier nicht – Gerät prüfen bzw. tauschen lassen.',
    sperrt: ['komponenten', 'systemdateien'] },
  { id: 'u-ram', titel: 'Arbeitsspeicher wahrscheinlich defekt', gewicht: 90, beleg: ['v1-speicher'],
    erklaert: [...ABSTURZ, 'v2-systemdll', 'integ-cbs-spuren'],
    text: () => 'Wechselnde Speicher-Fehlercodes bzw. Fehler der Speicherdiagnose. Defekter RAM verursacht zufällige Abstürze und kann Dateien beschädigen – erst RAM testen/tauschen, dann reparieren.',
    sperrt: ['komponenten', 'systemdateien'] },
  { id: 'u-platte-verdacht', titel: 'Verdacht auf Datenträgerproblem', gewicht: 70, beleg: ['v1-datentraeger', 'evt:platte-intern'],
    erklaert: ['evt:bluescreen', 'evt:hart-aus', 'evt:lx-dateisystem', 'integ-cbs-spuren'],
    text: () => 'Abstürze bzw. Ereignisse zeigen auf den Datenträger. Die Datenträger-Analyse klärt, ob die Platte selbst oder nur das Dateisystem betroffen ist.' },
  { id: 'u-treiber', titel: 'Ein Treiber verursacht die Abstürze', gewicht: 80, beleg: ['v1-treiber'],
    erklaert: ['evt:bluescreen', 'evt:hart-aus', 'v1-unklar', 'evt:lx-livekernel'],
    text: b => b.find(x => x.typ === 'v1-treiber')?.text || 'Die Fehlercodes passen zu einem Treiberfehler.' },
  { id: 'u-grafik', titel: 'Der Grafiktreiber ist die Ursache', gewicht: 75, beleg: ['v1-grafik', 'v2-grafik'], mitAuch: ['evt:grafik-haengt', 'evt:lx-livekernel', 'evt:bluescreen', 'v1-grafik', 'v2-grafik'],
    erklaert: ['evt:grafik-haengt', 'evt:lx-livekernel', 'evt:bluescreen', 'v2-grafik', 'v1-grafik', /^dg:bildschirm|^dg:bild4/],
    text: b => { const v1 = b.find(x => x.typ === 'v1-grafik'); return `${v1 ? v1.text + '. ' : 'Grafiktreiber-Abstürze (schwarzer Bildschirm, TDR, Bluescreen 0x116). '}Treiber über die Treiber-Installation aktualisieren bzw. sauber neu installieren${v1 && /kurz davor geändert/.test(v1.text) ? ' – oder die kurz davor gekommene Änderung zurücknehmen' : ''}.` } },
  { id: 'u-hitze', titel: 'Überhitzung bzw. Drosselung', gewicht: 65, beleg: ['v1-hitze', 'evt:lx-drosselung'], mitAuch: ['evt:hart-aus', 'evt:bluescreen', 'v1-hitze', /^dg:leistung/],
    erklaert: ['evt:hart-aus', 'evt:lx-drosselung', 'v1-strom', /^dg:leistung-(pc-langsam|luefter)/],
    text: () => 'Der Prozessor wird wegen Hitze gedrosselt bzw. der PC schaltet ab – Kühlung/Lüfter prüfen, bevor Software angefasst wird.' },
  { id: 'u-komponenten', titel: 'Beschädigter Windows-Komponentenspeicher', gewicht: 60, beleg: ['integ-speicher-reparierbar', 'integ-speicher-nicht-reparierbar', 'v4-reparierbar', 'v4-nicht-reparierbar', 'v3-komponenten', 'v4-systemdateien', 'v1-systemdateien', 'v2-systemdll', 'srv-dism-auffaellig'],
    erklaert: ['integ-wu-fehler', 'v3-*', 'integ-cbs-spuren', 'v4-*', 'v2-systemdll', 'v1-systemdateien', 'evt:lx-wu-datenbank', /^dg:update-fehler/],
    text: () => 'Windows-Komponenten bzw. Systemdateien sind beschädigt. Deshalb scheitern Updates und es kann zu Abstürzen kommen – erst DISM, dann SFC, dann Updates.' },
  { id: 'u-platz', titel: 'Zu wenig Speicherplatz', gewicht: 55, beleg: ['integ-platz-knapp', 'v3-platz'], mitAuch: ['integ-wu-fehler', 'v3-*', 'evt:lx-schattenkopien', /^dg:leistung/, 'integ-platz-knapp'],
    erklaert: ['integ-wu-fehler', 'v3-platz', 'evt:lx-schattenkopien', /^dg:leistung-c(-|voll)/],
    text: () => 'Das Systemlaufwerk ist fast voll – Updates scheitern und Windows wird langsam. Zuerst Platz schaffen.' },
  { id: 'u-neustart', titel: 'Ausstehender Neustart blockiert Wartung', gewicht: 50, beleg: ['integ-neustart-ausstehend', 'v3-neustart', 'v4-sfc-blockiert'], mitAuch: ['integ-wu-fehler', 'v3-*', 'v4-sfc-blockiert', 'integ-checkhealth-fehler', 'evt:installation'],
    erklaert: ['integ-wu-fehler', 'v3-neustart', 'v4-sfc-blockiert', 'integ-checkhealth-fehler', 'integ-neustart-ausstehend', 'evt:installation'],
    text: () => 'Windows wartet auf einen Neustart. Bis dahin scheitern Updates, Installationen und Reparaturen – zuerst neu starten, danach erneut prüfen.',
    zuerst: true },
  { id: 'u-zeit', titel: 'Falsche Uhrzeit stört die Anmeldung', gewicht: 50, beleg: ['evt:lx-zeit'], mitAuch: ['evt:lx-kerberos', 'evt:lx-gpo', 'evt:richtlinien', 'evt:lx-kein-dc'],
    erklaert: ['evt:lx-kerberos', 'evt:lx-gpo', 'evt:richtlinien', 'evt:lx-zeit'],
    text: () => 'Der Zeitdienst synchronisiert nicht; Kerberos-Anmeldungen und Richtlinien scheitern deshalb – zuerst die Uhrzeit abgleichen.' },
  { id: 'u-zscaler', titel: 'Zscaler ist aus bzw. nicht verbunden', gewicht: 50, beleg: [/^dg:vpn-zscaler/], mitAuch: ['evt:lx-dns', 'v3-verbindung', 'evt:lx-kein-dc', /^dg:netz/, /^dg:browser/, /^dg:web/],
    erklaert: ['evt:lx-dns', 'v3-verbindung', 'evt:lx-kein-dc', /^dg:netz/, /^dg:web/],
    text: () => 'Ohne aktiven Zscaler fehlen Internet und interne Ziele – Netz-, Update- und Anmeldefehler folgen daraus. Zuerst Zscaler prüfen.' },
  { id: 'u-domaene', titel: 'Verbindung zur Domäne gestört', gewicht: 45, beleg: ['evt:vertrauen', 'evt:lx-kein-dc'], mitAuch: ['evt:lx-gpo', 'evt:richtlinien', 'evt:lx-kerberos', 'evt:vertrauen'],
    erklaert: ['evt:lx-gpo', 'evt:richtlinien', 'evt:lx-kerberos', 'evt:lx-kein-dc'],
    text: () => 'Der PC erreicht die Domäne nicht zuverlässig bzw. sein Computerkonto ist gestört – Richtlinien und Anmeldungen scheitern.' },
  { id: 'u-shellext', titel: 'Eine fremde Shell-Erweiterung bringt den Explorer zum Absturz', gewicht: 45, beleg: ['v2-shellext'],
    erklaert: ['evt:absturz-bekannt', 'evt:absturz-sonstige', 'v2-shellext', /^dg:win-explorer/],
    text: b => b.find(x => x.typ === 'v2-shellext')?.text || 'Explorer stürzt in einer Erweiterung eines anderen Programms ab.' },
  { id: 'u-vss', titel: 'Sicherung scheitert an VSS', gewicht: 45, beleg: ['srv-vss-writer'], mitAuch: ['evt:lx-sicherung', 'evt:lx-vss'],
    erklaert: ['evt:lx-sicherung', 'evt:lx-vss', 'srv-vss-writer'],
    text: () => 'Ein VSS-Writer ist im Fehlerzustand; die Sicherung scheitert daran – Writer-Dienst neu starten, dann Sicherung erneut.' },
  // Nur wenn die eingebaute Platte sauber ist (kein v5-defekt/-dateisystem): dann erklären sich die
  // Dateisystem-Ereignisse des Rundumscans durch den Stick. „evt:platte-intern“ bleibt stehen — der
  // Rundumscan ordnet Stick-Ereignisse schon selbst „evt:platte-extern“ zu.
  { id: 'u-wechseldatentraeger', titel: 'Die Datenträgerfehler stammen von einem USB-Stick', gewicht: 35, beleg: ['v5-wechseldatentraeger'],
    mitAuch: ['evt:lx-dateisystem', 'evt:platte-extern'],
    erklaert: ['evt:lx-dateisystem', 'evt:platte-extern'],
    text: () => 'Die Datenträger- und Dateisystemfehler betreffen einen Wechseldatenträger (meist ein ohne „Auswerfen“ abgezogener USB-Stick), nicht die eingebaute Platte. Am PC ist dafür nichts zu reparieren.' },
]

/** Ursachen ermitteln; markiert erklärte Befunde mit `folgeVon` (außer dem Hauptbefund). */
export function bestimmeUrsachen(befunde: VdBefund[]): { ursachen: VdUrsache[]; befunde: VdBefund[] } {
  const ursachen: VdUrsache[] = []
  const folge = new Map<string, string>()
  for (const r of URSACHEN_REGELN) {
    const belege = befunde.filter(b => passt(b.typ, r.beleg))
    if (!belege.length) continue
    if (r.mitAuch && !befunde.some(b => !belege.includes(b) && passt(b.typ, r.mitAuch!)) && belege.length < 2) continue
    // Verdacht nur, wenn die Bestätigung (v5) noch fehlt
    if (r.id === 'u-platte-verdacht' && befunde.some(b => b.typ === 'v5-defekt' || b.typ === 'v5-unauffaellig' || b.typ === 'v5-dateisystem' || b.typ === 'v5-wechseldatentraeger')) continue
    if (r.id === 'u-wechseldatentraeger' && befunde.some(b => b.typ === 'v5-defekt' || b.typ === 'v5-dateisystem' || b.typ === 'v1-datentraeger')) continue
    const haupt = [...belege].sort((a, b) => (a.schwere === 'kritisch' ? 0 : a.schwere === 'warnung' ? 1 : 2) - (b.schwere === 'kritisch' ? 0 : b.schwere === 'warnung' ? 1 : 2))[0]
    const erklaert = befunde.filter(b => b !== haupt && (belege.includes(b) || passt(b.typ, r.erklaert)))
    ursachen.push({
      id: r.id, titel: r.titel, text: r.text(befunde), gewicht: r.gewicht, haupt: haupt.id,
      befunde: [haupt.id, ...erklaert.map(b => b.id)],
      belege: [haupt.titel, ...erklaert.slice(0, 6).map(b => b.titel)],
      sperrt: r.sperrt, zuerst: r.zuerst || undefined,
    })
    for (const b of erklaert) if (!folge.has(b.id)) folge.set(b.id, r.id)
  }
  ursachen.sort((a, b) => b.gewicht - a.gewicht)
  return { ursachen, befunde: befunde.map(b => (folge.has(b.id) ? { ...b, folgeVon: folge.get(b.id) } : { ...b, folgeVon: undefined })) }
}
