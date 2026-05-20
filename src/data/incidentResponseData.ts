// ── Incident Response Master-Dokument Daten ──────────────────────────────────
// Meldeprozess und Notfallkommunikation v1.0 (2026-04-17)
// OT-Security-Koordinator: Davide Bazzani
// OT-Security-Officer: Sascha Herges

// ── Dokument-Metadaten ───────────────────────────────────────────────────────

export const DOC_META = {
  title: 'Meldeprozess und Notfallkommunikation',
  subtitle: 'Master-Dokument: Interner Meldeweg, Eskalationsprozess und Notfallkommunikationskonzept',
  legalBasis: 'Gemaess \u00a730 Abs. 2 Nr. 10 BSIG / \u00a735 BSIG / Art. 21 und 23 NIS2-Richtlinie',
  version: '1.0 (Master-Zusammenfuehrung)',
  date: '2026-04-17',
  otSecurityCoordinator: 'Davide Bazzani',
  otSecurityOfficer: 'Sascha Herges',
  status: 'FREIGEGEBEN',
}

// ── Rollen und Verantwortlichkeiten ──────────────────────────────────────────

export interface RoleEntry {
  role: string
  person?: string
  responsibility: string
}

export const ROLES: RoleEntry[] = [
  { role: 'OT-Security-Koordinator', person: 'Davide Bazzani', responsibility: 'Gesamtverantwortung, Prozess-Improvements, standortuebergreifende Abstimmung, Pflege des Dokuments, Erst- und Folgemeldungen an BSI.' },
  { role: 'OT-Security-Officer', person: 'Sascha Herges', responsibility: 'Operative Koordination im Notfall, technische Reaktion und Analyse, Durchfuehrung der BSI-Fruehwarnmeldung.' },
  { role: 'IT-Leitung', responsibility: 'Technische Infrastruktur (Mobilnetze, VPN, Notfall-Systeme), Bereitstellung Kommunikationsersatz.' },
  { role: 'Geschaeftsleitung', person: 'Martin Johannsmann', responsibility: 'Freigabe von Massnahmen, Strategiedefinition, Management-Eskalation bei kritischen OT-Vorfaellen.' },
  { role: 'BCP-Manager', person: 'Christian Rathjens', responsibility: 'Business Continuity, Koordination Wiederanlauf.' },
  { role: 'NIS2-Beauftragte Standorte DE', person: 'Warmuth / Weigand / Moebus', responsibility: 'Standortuebergreifende Abstimmung vor BSI-Meldung, juristische Einschaetzung.' },
]

// ── Gesetzliche Grundlagen ───────────────────────────────────────────────────

export const LEGAL_BASES = [
  { ref: '\u00a730 Abs. 2 Nr. 10 BSIG', text: 'Pflicht zur Implementierung eines Notfallkommunikationskonzepts.' },
  { ref: '\u00a735 BSIG', text: 'Unterrichtung von betroffenen Dienstempfaengern bei erheblichen Sicherheitsvorfaellen.' },
  { ref: 'Art. 21 Abs. 2 NIS2-RL', text: 'Massnahmen zum Sicherheitsrisikomanagement.' },
  { ref: 'Art. 23 NIS2-RL', text: 'Berichtspflichten (24h-Fruehwarnung, 72h-Meldung, 30-Tage-Abschlussbericht).' },
]

// ── 5-Schritte Interner Meldeweg ─────────────────────────────────────────────

export interface MeldewegStep {
  step: number
  title: string
  bullets: string[]
  timeLimit?: string
  nis2?: boolean
  sharepointLink?: boolean
}

export const MELDEWEG_STEPS: MeldewegStep[] = [
  {
    step: 1,
    title: 'Analyse und Ursachenfeststellung',
    timeLimit: 'max 10 min',
    bullets: [
      'Umfang des Vorfalls feststellen: Wie viele User sind betroffen? Welche Systeme oder Dienste sind beeintraechtigt?',
      'Schnelldiagnose (max. 10 Minuten): Parallel zur Umfangserhebung eine Kurzanalyse durchfuehren.',
      'Kernfrage: Liegt ein Server-, Netzwerk-, Client- oder Stromproblem vor?',
    ],
  },
  {
    step: 2,
    title: 'Eskalation des Problems',
    bullets: [
      'Falls die Ursache nach 10 Minuten nicht klar ist: im Zweifel mehrere der zustaendigen Ansprechpartner kontaktieren und vom Problem unterrichten.',
      'Incident-Ticket erstellen: Parallel zur Kontaktaufnahme ein Incident-Ticket im SIAM-System eroeffnen und dieses direkt an das SIAM Critical Incident Management weiterleiten (SIAMCriticalIncidentManagement@SKF.com).',
      'Verweis auf die Kontaktlisten nach Problemkategorie (siehe Kontaktverzeichnisse).',
    ],
  },
  {
    step: 3,
    title: 'Manager / Ansprechpartner ueber Ausfallzeit informieren',
    bullets: [
      'Ausfallzeit abschaetzen: Eine Einschaetzung der voraussichtlichen Dauer bis zur Behebung einholen. Sofern ein externer Dienstleister beteiligt ist, ausdruecklich eine Zeitschaetzung anfordern.',
      'Ansprechpartner informieren: Geschaeftsleitung, Prokuristen sowie die zustaendigen Manager zeitnah kontaktieren und ueber die geschaetzte Ausfallzeit informieren.',
      'Manager informieren ihre Mitarbeitenden: Die informierten Manager der Fachbereiche sind verpflichtet, die Information direkt an ihre Mitarbeitenden weiterzugeben.',
    ],
  },
  {
    step: 4,
    title: 'Intranet-Meldung verfassen',
    sharepointLink: true,
    bullets: [
      'Meldung auf dem internen SharePoint veroeffentlichen.',
      'Mitarbeitende ueber Neuigkeiten informieren: Der SharePoint-Kanal wird kontinuierlich mit Updates gepflegt \u2014 Fortschritt, neue Erkenntnisse, voraussichtliche Wiederherstellungszeit und Behebung.',
    ],
  },
  {
    step: 5,
    title: 'NIS2-Relevanz pruefen',
    nis2: true,
    bullets: [
      'Pruefen, ob es sich um einen NIS2-relevanten Sicherheitsvorfall handelt. Hierfuer gelten die Kriterien aus dem Eskalationsprozess sowie die NIS2-Meldepflicht-Schnellanleitung (Dokument 2.03.1).',
      'Bei NIS2-relevanten Vorfaellen gelten gesetzliche Meldefristen (siehe BSI-Meldefristen).',
      'Hinweis: Dies wird bewusst am Ende geprueft, weil die technische Eingrenzung und Information der Belegschaft zeitkritisch sind. Die NIS2-Bewertung erfolgt parallel bzw. im Anschluss durch den OT-Security-Koordinator.',
    ],
  },
]

// ── Eskalationsweg (6 Stufen) ────────────────────────────────────────────────

export interface EscalationLevel {
  level: number
  title: string
  details: string[]
  deadline: string
  color: string // tailwind color class
}

export const ESCALATION_LEVELS: EscalationLevel[] = [
  {
    level: 1, title: 'Erkennung', deadline: 'sofort', color: 'text-blue-400',
    details: [
      'Quellen: Mitarbeitermeldung, Monitoring/SIEM, externer Dienstleister.',
      'Empfaenger: IT / OT / SOC-Kontakt / OT-Security-Koordinator.',
    ],
  },
  {
    level: 2, title: 'Bewertung', deadline: 'innerhalb weniger Stunden', color: 'text-cyan-400',
    details: [
      'Durchfuehrung: OT-Security-Koordinator.',
      'Kernfragen: IT oder OT betroffen? Produktionsauswirkung? Sicherheitsrelevant? Meldepflichtig nach NIS2?',
    ],
  },
  {
    level: 3, title: 'Interne Eskalation', deadline: 'am selben Tag', color: 'text-yellow-400',
    details: [
      'Bei bestaetigtem Sicherheitsvorfall: Information an OT-Asset-Owner, IT-Leitung, BCP-Manager.',
      'Entscheidung: Incident Response aktivieren, Krisenmodus ja/nein.',
    ],
  },
  {
    level: 4, title: 'Management-Eskalation', deadline: 'unverzueglich', color: 'text-orange-400',
    details: [
      'Wenn kritische OT betroffen ist, Produktionsausfall droht oder eine externe Meldung notwendig wird: Geschaeftsleitung informieren.',
    ],
  },
  {
    level: 5, title: 'Standortuebergreifende Abstimmung vor BSI-Meldung', deadline: 'spaetestens innerhalb von 20 Stunden', color: 'text-red-400',
    details: [
      'Vor der Erstmeldung an das BSI ist eine standortuebergreifende Abstimmung mit den OT-Security-Ansprechpartnern aller deutschen SKF-Standorte zwingend erforderlich.',
      'Ziele: Gemeinsame Bewertung der Meldepflicht, einheitliche Darstellung gegenueber dem BSI, juristische Einschaetzung, Festlegung meldepflichtiger Rechtseinheiten.',
      'Ansprechpartner: Marion Warmuth, Heiko Weigand, Dennis Moebus.',
    ],
  },
  {
    level: 6, title: 'Erstmeldung (Fruehwarnung) an das BSI', deadline: 'innerhalb von 24 Stunden nach Erkennung', color: 'text-red-500',
    details: [
      'Nach erfolgter Abstimmung (oder bei Ablauf der 24-Stunden-Frist): Fruehwarnmeldung an das BSI einreichen.',
      'Verantwortlich: OT-Security-Officer / benannter Melder.',
      'Meldekanal: BSI-Meldeportal (buerger-cert@bsi.bund.de).',
    ],
  },
]

// ── BSI-Meldefristen ─────────────────────────────────────────────────────────

export interface BsiDeadline {
  stage: string
  deadline: string
  content: string
  color: string
}

export const BSI_DEADLINES: BsiDeadline[] = [
  { stage: '1. Fruehwarnung (Early Warning)', deadline: '24 Stunden', content: 'Verdacht auf Sicherheitsvorfall / Art des Vorfalls / Betroffene Systeme. Ziel: BSI weiss "Da ist was, wir untersuchen."', color: 'text-yellow-400' },
  { stage: '2. Vorfallsmitteilung', deadline: '72 Stunden', content: 'Bestaetigter Vorfall / Erste Ursachen / Erste Auswirkungen / Eingeleitete Massnahmen. Ziel: Transparenz und Lagebild.', color: 'text-orange-400' },
  { stage: '3. Abschlussbericht', deadline: 'spaetestens 1 Monat', content: 'Root Cause (Ursachenanalyse) / Tatsaechliche Auswirkungen / Massnahmen und Lessons Learned. Ziel: Nachvollziehbarkeit und Verbesserung.', color: 'text-red-400' },
]

// ── Notfallkommunikation ─────────────────────────────────────────────────────

export interface CrisisScenario {
  scenario: string
  duration: string
  impact: string
}

export const CRISIS_SCENARIOS: CrisisScenario[] = [
  { scenario: 'Ausfall E-Mail-System', duration: 'Wenige Stunden bis mehrere Tage', impact: 'Keine E-Mail-Kommunikation moeglich, Verzoegerung bei Ticketing und Dokumentation.' },
  { scenario: 'Ausfall Teams / VoIP', duration: 'Wenige Minuten bis Stunden', impact: 'Keine schnelle Sprachkommunikation, Video-Conferencing nicht moeglich.' },
  { scenario: 'Ausfall Internet / WAN', duration: 'Wenige Minuten bis Stunden', impact: 'Keine externe Kommunikation moeglich, Remote-Work unmoeglich.' },
  { scenario: 'Ransomware-Angriff mit Verschluesselung', duration: 'Mehrere Stunden bis Tage', impact: 'Systeme nicht verfuegbar, externe Benachrichtigung erforderlich.' },
]

export const PRIMARY_CHANNELS = [
  'E-Mail (Microsoft Exchange)',
  'Microsoft Teams (Chat, Telefonie, Video)',
  'Unternehmenstelefon (VoIP)',
  'Intranet-Portal (SharePoint)',
]

export interface EmergencyCommLevel {
  level: number
  title: string
  participants: string
  trigger?: string
  channel: string
  goal: string
}

export const EMERGENCY_COMM_LEVELS: EmergencyCommLevel[] = [
  {
    level: 1, title: 'OT-Team Intern',
    participants: 'OT-Security-Officer, OT-Security-Koordinator, Systemadministratoren.',
    channel: 'Mobiltelefone (private Nummern gem. Notfall-Kontaktliste).',
    goal: 'Schnelle technische Bewertung und erste Gegenmassnahmen.',
  },
  {
    level: 2, title: '+ IT + Geschaeftsleitung',
    participants: 'IT-Leitung, Geschaeftsleitung (CEO / Betriebsrat falls relevant).',
    trigger: 'Vorfall dauert laenger als 30 Minuten oder hat hohes Schadensausmass.',
    channel: 'Notfall-Mobil, ggf. physisches Krisenmanagement-Meeting.',
    goal: 'Strategische Entscheidungen und Ressourcenfreigabe.',
  },
  {
    level: 3, title: '+ BSI + Externer IR-Partner',
    participants: 'BSI-Meldestelle, externer Incident Response Dienstleister.',
    trigger: 'KRITIS-relevanter Incident, potenzielle BSI-Meldepflicht, Ransomware-Angriff.',
    channel: 'Telefonische Benachrichtigung, danach formale Dokumentation.',
    goal: 'Externe Meldung und spezialisierte Unterstuetzung.',
  },
]

// ── Kontaktverzeichnisse ─────────────────────────────────────────────────────

export interface ContactEntry {
  name: string
  function?: string
  email: string | null
  phone: string | null
}

// 7.1 Interne IT-Notfallkontakte
export const CONTACTS_IT_EMERGENCY: ContactEntry[] = [
  { name: 'Davide Bazzani', email: 'davide.bazzani@skf.com', phone: '0176 31685816' },
  { name: 'Sascha Herges', email: 'sascha.herges@skf.com', phone: '01627312973' },
  { name: 'Andreas Benin', email: 'andreas.benin@skf.com', phone: '01724021048' },
  { name: 'Tim Voelkl', email: 'tim.voelkl@skf.com', phone: '017617617603' },
]

// 7.2 NIS2 OT-Security-Ansprechpartner Deutschland
export const CONTACTS_NIS2_DE: ContactEntry[] = [
  { name: 'Marion Warmuth', email: 'Marion.Warmuth@skf.com', phone: '+49 171 811 7635' },
  { name: 'Heiko Weigand', email: 'Heiko.Weigand@skf.com', phone: '+49 162 254 0247' },
  { name: 'Dennis Moebus', email: 'dennis.moebus@skf.com', phone: '+49 151 677 00932' },
]

// 7.3 BSI und externe Dienstleister
export const CONTACTS_EXTERNAL: ContactEntry[] = [
  { name: 'BSI-Meldestelle', email: 'buerger-cert@bsi.bund.de', phone: '+49 228 99 9582-222' },
  { name: 'SIAM Critical Incident', email: 'SIAMCriticalIncidentManagement@SKF.com', phone: null },
  { name: 'DXC BLR CIM (Server)', email: 'dcc_blr_cim@dxc.com', phone: null },
  { name: 'Orange Ops (Netzwerk)', email: 'skfintegrated.ops@orange.com', phone: null },
  { name: 'Dobromir Shopov (DXC)', email: 'dobromir.shopov@dxc.com', phone: '+359 885 922 822' },
  { name: 'Jason McBride (Orange)', email: 'jason.mcbride@orange.com', phone: '+44 7764 206 343' },
]

// 7.4 Kontakte nach Problemkategorie
export const CONTACTS_SERVER: ContactEntry[] = [
  { name: 'DXC BLR CIM', email: 'dcc_blr_cim@dxc.com', phone: null },
  { name: 'Dobromir Shopov', email: 'dobromir.shopov@dxc.com', phone: '+359 885 922 822' },
  { name: 'Srajit Karmakar', email: 'srajit.karmakar@skf.com', phone: '+91 9330034288' },
  { name: 'SIAM Critical Incident', email: 'SIAMCriticalIncidentManagement@SKF.com', phone: null },
]

export const CONTACTS_NETWORK: ContactEntry[] = [
  { name: 'Orange Ops', email: 'skfintegrated.ops@orange.com', phone: null },
  { name: 'Srajit Karmakar', email: 'srajit.karmakar@skf.com', phone: '+91 9330034288' },
  { name: 'Jason McBride', email: 'jason.mcbride@orange.com', phone: '+44 7764 206 343' },
  { name: 'SIAM Critical Incident', email: 'SIAMCriticalIncidentManagement@SKF.com', phone: null },
]

export const CONTACTS_CLIENT: ContactEntry[] = [
  { name: 'Renji Jacob', email: 'Renji.Jacob@skf.com', phone: '+91 9845173860' },
  { name: 'Ajay VK', email: 'ajay.vk@skf.com', phone: '+91 8590308270' },
  { name: 'Bhanu Prakash Vuriti', email: 'bhanu.prakash.vuriti@skf.com', phone: null },
  { name: 'SIAM Critical Incident', email: 'SIAMCriticalIncidentManagement@SKF.com', phone: null },
]

export const CONTACTS_POWER: ContactEntry[] = [
  { name: 'Sven Meyer', email: null, phone: '+49 40 30112770 / +49 173 6056938' },
  { name: 'Christian Ahrens', email: null, phone: '+49 40 30111770 / +49 173 2922939' },
]

// 7.5 Geschaeftsleitung und Prokuristen
export const CONTACTS_MANAGEMENT: ContactEntry[] = [
  { name: 'Martin Johannsmann', function: 'Director Marine BU', email: 'Martin.Johannsmann@skf.com', phone: '+49 172 4029811' },
  { name: 'Hannah Taubenreuther', function: 'Marine BU Controller (KR)', email: 'hannah.taubenreuther@skf.com', phone: '+49 151 46324329 / +49 160 2677324' },
  { name: 'Christoph Tunn', function: 'Senior Manager Shaft Components (S20)', email: 'Christoph.Tunn@skf.com', phone: '+49 173 2597615' },
  { name: 'Matthias Frank', function: 'Executive Manager Procurement (KE)', email: 'matthias.frank@skf.com', phone: '+49 171 9471182' },
  { name: 'Stefan Meyer', function: 'Factory Manager (S50) Production', email: 'stefan.meyer@skf.com', phone: '+49 151 63371473' },
  { name: 'Ina Scheuner', function: 'Senior Manager Stabilizers and Steering Gear (S30)', email: 'ina.scheuner@skf.com', phone: '+49 151 65230568' },
]

// 7.6 Manager SKF Marine - Fachbereiche
export const CONTACTS_MANAGERS: ContactEntry[] = [
  { name: 'Sascha Herges', function: 'Director IT (KI)', email: 'sascha.herges@skf.com', phone: '+49 151 51705218' },
  { name: 'Meike Finnern', function: 'Strategic People Business Enabler BU Marine (PX)', email: 'Meike.Finnern@skf.com', phone: '+49 151 53340757' },
  { name: 'Oliver Pietrasz', function: 'EHS (Site) Manager (KAS)', email: 'Oliver.Pietrasz@skf.com', phone: '+49 173 2052796' },
  { name: 'Lena Meyer', function: 'Manager PMO (KPMO)', email: 'lena.meyer@skf.com', phone: '+49 151 22571213' },
  { name: 'Petra Warpakowski', function: 'Chairwoman Works Council (BR)', email: 'Petra.Warpakowski@skf.com', phone: '+49 171 8141690' },
  { name: 'Frank Kania', function: 'Head of Sales Shaft Components (S12)', email: 'frank.kania@skf.com', phone: '+49 151 62780452' },
  { name: 'Christian Rathjens', function: 'Manager Production Shaft Components (S51)', email: 'christian.rathjens@skf.com', phone: '+49 151 59980470' },
  { name: 'Jamel Gamairi', function: 'Teamleader Shaft Components Assembly (S514)', email: 'jamel.gamairi@skf.com', phone: '+49 172 4418784' },
  { name: 'Stephan Cholewa', function: 'Manager Test Area and Product Blue Run (S213/S214)', email: 'stephan.cholewa@skf.com', phone: '+49 170 9600594' },
  { name: 'Nils Schaper', function: 'Senior Manager Stabilizer and Steering Gear (S30)', email: 'nils.schaper@skf.com', phone: '+49 151 52024796' },
  { name: 'Holger Spardel', function: 'Sen. Manager Design Stab. and Steering Gear (S31)', email: 'Holger.Spardel@skf.com', phone: '+49 40 30112536' },
  { name: 'Uwe Roeben', function: 'Manager Technology Development Stabi Ruder (S33)', email: 'uwe.roeben@skf.com', phone: '+49 151 19145395' },
  { name: 'David Kluters', function: 'Manager Production Stabilizer and Steering Gear (S52)', email: 'david.kluters@skf.com', phone: '+49 170 2015668' },
  { name: 'Stefan Borsych', function: 'Teamleader Machining Stabilizer and Steering Gear (S522)', email: 'stefan.borsych@skf.com', phone: '+49 151 61740770' },
  { name: 'Jan Freitag', function: 'Manager OWS and BWMS (S40)', email: 'Jan.Freitag@skf.com', phone: '+49 172 4021072' },
  { name: 'Jochen Lorenscheit', function: 'Senior Manager Ocean Energy (S60)', email: 'Jochen.Lorenscheit@skf.com', phone: '+49 172 6975021' },
  { name: 'Peter Winkler', function: 'Teamleader Assembly Bearings, Energy and OWS (S515)', email: 'Peter.Winkler@skf.com', phone: '+49 172 4011089' },
  { name: 'Jan Hoffmann', function: 'Senior Manager Service (S70)', email: 'Jan.Hoffmann@skf.com', phone: '+49 173 9002108' },
]

// ── Problemkategorie-Tabs (fuer Kontaktverzeichnis) ──────────────────────────

export type ProblemCategory = 'server' | 'network' | 'client' | 'power' | 'it-emergency' | 'nis2-de' | 'bsi-external' | 'management' | 'managers'

export interface CategoryTab {
  id: ProblemCategory
  label: string
  icon: string
  color: string
  description: string
  contacts: ContactEntry[]
  infoText?: string
}

export const CONTACT_TABS: CategoryTab[] = [
  { id: 'it-emergency', label: 'IT-Notfallkontakte', icon: 'Phone', color: 'text-red-400', description: 'Interne IT-Notfallkontakte SKF Marine', contacts: CONTACTS_IT_EMERGENCY },
  { id: 'server', label: 'Serverprobleme', icon: 'Server', color: 'text-purple-400', description: 'Server outages, performance degradation, service failures', contacts: CONTACTS_SERVER },
  { id: 'network', label: 'Netzwerkprobleme', icon: 'Wifi', color: 'text-blue-400', description: 'Connectivity problems, DNS failures, VPN issues', contacts: CONTACTS_NETWORK },
  { id: 'client', label: 'Computer-/Userprobleme', icon: 'Monitor', color: 'text-green-400', description: 'Widespread PC problems, login failures, software issues', contacts: CONTACTS_CLIENT },
  { id: 'power', label: 'Stromausfall', icon: 'Zap', color: 'text-yellow-400', description: 'Building power failures, UPS alerts', contacts: CONTACTS_POWER },
  { id: 'nis2-de', label: 'NIS2 Ansprechpartner DE', icon: 'Shield', color: 'text-orange-400', description: 'Standortuebergreifende Abstimmung vor BSI-Meldung', contacts: CONTACTS_NIS2_DE, infoText: 'Diese Personen muessen vor einer BSI-Erstmeldung kontaktiert und in die Bewertung einbezogen werden (siehe Eskalationsweg, Stufe 5).' },
  { id: 'bsi-external', label: 'BSI & Externe', icon: 'Building2', color: 'text-cyan-400', description: 'BSI-Meldestelle und externe Dienstleister', contacts: CONTACTS_EXTERNAL },
  { id: 'management', label: 'Geschaeftsleitung', icon: 'Crown', color: 'text-amber-400', description: 'Geschaeftsleitung und Prokuristen SKF Marine', contacts: CONTACTS_MANAGEMENT },
  { id: 'managers', label: 'Fachbereichs-Manager', icon: 'Users', color: 'text-indigo-400', description: 'Manager der Fachbereiche \u2014 bei Vorfaellen mit Auswirkung auf ihren Bereich informieren', contacts: CONTACTS_MANAGERS, infoText: 'Bei Vorfaellen mit Auswirkung auf die jeweiligen Fachbereiche: die zustaendigen Manager ueber die geschaetzte Ausfallzeit informieren.' },
]
