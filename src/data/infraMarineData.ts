// src/data/infraMarineData.ts

// ── Typen ─────────────────────────────────────────────────────────────────

export interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  category: ContactCategory
  isExternal: boolean
}

export type ContactCategory =
  | 'server'
  | 'network'
  | 'client'
  | 'power'
  | 'external'
  | 'internal-emergency'

export interface CategoryMeta {
  id: ContactCategory
  label: string
  icon: string
  color: string
  description: string
}

export interface EmailTemplate {
  id: string
  label: string
  subject: string
  body: string
  category: ContactCategory | 'general'
}

// ── Kategorie-Metadaten ───────────────────────────────────────────────────

export const CATEGORIES: CategoryMeta[] = [
  { id: 'server',             label: 'Server Issues',              icon: 'Server',    color: 'text-purple-400', description: 'Server outages, performance degradation, service failures' },
  { id: 'network',            label: 'Network Issues',             icon: 'Wifi',      color: 'text-blue-400',   description: 'Connectivity problems, DNS failures, VPN issues' },
  { id: 'client',             label: 'Client / User Issues',       icon: 'Monitor',   color: 'text-green-400',  description: 'Widespread PC problems, login failures, software issues affecting 10+ users' },
  { id: 'power',              label: 'Power Outage',               icon: 'Zap',       color: 'text-yellow-400', description: 'Building power failures, UPS alerts' },
  { id: 'external',           label: 'External Service Providers', icon: 'Building2', color: 'text-orange-400', description: 'DXC (Servers), Orange (Network)' },
  { id: 'internal-emergency', label: 'Internal IT Emergency',      icon: 'Phone',     color: 'text-red-400',    description: 'Direct mobile numbers — IT Team SKF Marine' },
]

// ── Kontaktdaten ──────────────────────────────────────────────────────────

export const CONTACTS: Contact[] = [
  // Server
  { id: 'srv-1', name: 'DXC BLR CIM',            email: 'dcc_blr_cim@dxc.com',                       phone: null,                              category: 'server', isExternal: true },
  { id: 'srv-2', name: 'Dobromir Shopov',         email: 'dobromir.shopov@dxc.com',                    phone: '+359 885 922 822',                category: 'server', isExternal: true },
  { id: 'srv-3', name: 'Srajit Karmakar',         email: 'srajit.karmakar@skf.com',                    phone: '+91 9330034288',                  category: 'server', isExternal: false },
  { id: 'srv-4', name: 'SIAM Critical Incident',  email: 'SIAMCriticalIncidentManagement@SKF.com',     phone: null,                              category: 'server', isExternal: false },

  // Network
  { id: 'net-1', name: 'Orange Ops',              email: 'skfintegrated.ops@orange.com',                phone: null,                              category: 'network', isExternal: true },
  { id: 'net-2', name: 'Srajit Karmakar',         email: 'srajit.karmakar@skf.com',                    phone: '+91 9330034288',                  category: 'network', isExternal: false },
  { id: 'net-3', name: 'Jason McBride',           email: 'jason.mcbride@orange.com',                   phone: '+44 7764 206 343',                category: 'network', isExternal: true },
  { id: 'net-4', name: 'SIAM Critical Incident',  email: 'SIAMCriticalIncidentManagement@SKF.com',     phone: null,                              category: 'network', isExternal: false },

  // Client / User
  { id: 'cli-1', name: 'Renji Jacob',             email: 'Renji.Jacob@skf.com',                        phone: '+91 9845173860',                  category: 'client', isExternal: false },
  { id: 'cli-2', name: 'Ajay VK',                 email: 'ajay.vk@skf.com',                            phone: '+91 8590308270',                  category: 'client', isExternal: false },
  { id: 'cli-3', name: 'Bhanu Prakash Vuriti',    email: 'bhanu.prakash.vuriti@skf.com',                phone: null,                              category: 'client', isExternal: false },
  { id: 'cli-4', name: 'SIAM Critical Incident',  email: 'SIAMCriticalIncidentManagement@SKF.com',     phone: null,                              category: 'client', isExternal: false },

  // Power
  { id: 'pwr-1', name: 'Sven Meyer',              email: null, phone: '+49 40 30112770 / +49 1736056938',  category: 'power', isExternal: false },
  { id: 'pwr-2', name: 'Christian Ahrens',         email: null, phone: '+49 40 30111770 / +49 1732922939',  category: 'power', isExternal: false },

  // External Service Providers
  { id: 'ext-1', name: 'DXC (Server)',             email: 'dcc_blr_cim@dxc.com',                        phone: null, category: 'external', isExternal: true },
  { id: 'ext-2', name: 'Orange (Network)',         email: 'skfintegrated.ops@orange.com',                phone: null, category: 'external', isExternal: true },

  // Internal Emergency (IT Team SKF Marine)
  { id: 'emer-1', name: 'Davide Bazzani',         email: null, phone: '0176 31685816',   category: 'internal-emergency', isExternal: false },
  { id: 'emer-2', name: 'Sascha Herges',          email: null, phone: '01627312973',      category: 'internal-emergency', isExternal: false },
  { id: 'emer-3', name: 'Andreas Benin',          email: null, phone: '01724021048',      category: 'internal-emergency', isExternal: false },
  { id: 'emer-4', name: 'Tim Voelkl',             email: null, phone: '017617617603',     category: 'internal-emergency', isExternal: false },
]

// ── E-Mail-Vorlagen (auf Englisch) ────────────────────────────────────────

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'general-incident',
    label: 'General Incident Report',
    subject: '[INCIDENT] SKF Marine Hamburg \u2014 Service Disruption affecting {userCount} users',
    body: `Dear Team,

We are currently experiencing a service disruption at SKF Marine Hamburg (Hermann-Blohm-Strasse).

Incident Summary:
- Affected users: approximately {userCount}
- Impact started: {startTime}
- Affected systems/services: {affectedSystems}
- Current status: Under investigation

Initial analysis:
{initialAnalysis}

We will provide updates as more information becomes available.

Best regards,
{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'general',
  },
  {
    id: 'server-outage',
    label: 'Server Outage Notification',
    subject: '[CRITICAL] Server Outage \u2014 SKF Marine Hamburg \u2014 Immediate Attention Required',
    body: `Dear Support Team,

We are reporting a critical server issue at SKF Marine Hamburg.

Details:
- Server/Service affected: {affectedSystems}
- Symptoms: {symptoms}
- Number of affected users: {userCount}
- Outage started: {startTime}
- NIS2 relevance: {nis2Status}

Immediate actions taken:
{actionsTaken}

Please escalate as needed and provide an ETA for resolution.

Best regards,
{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'server',
  },
  {
    id: 'network-outage',
    label: 'Network Outage Notification',
    subject: '[CRITICAL] Network Disruption \u2014 SKF Marine Hamburg',
    body: `Dear Network Operations Team,

We are experiencing a network disruption at SKF Marine Hamburg.

Details:
- Scope: {affectedSystems}
- Symptoms: {symptoms}
- Affected users: approximately {userCount}
- Issue started: {startTime}
- Diagnostic results: {initialAnalysis}

Please investigate and advise on next steps.

Best regards,
{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'network',
  },
  {
    id: 'client-widespread',
    label: 'Widespread Client Issue',
    subject: '[INCIDENT] Widespread Client Issue \u2014 SKF Marine Hamburg \u2014 {userCount} users affected',
    body: `Dear Support Team,

Multiple users at SKF Marine Hamburg are reporting the same issue.

Details:
- Problem description: {symptoms}
- Number of affected users: {userCount}
- Affected systems: {affectedSystems}
- Issue started: {startTime}
- Common pattern: {initialAnalysis}

Please assist with root cause analysis and remediation.

Best regards,
{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'client',
  },
  {
    id: 'power-outage',
    label: 'Power Outage Alert',
    subject: '[EMERGENCY] Power Outage \u2014 SKF Marine Hamburg \u2014 Immediate Response Required',
    body: `URGENT \u2014 Power Outage Report

Location: SKF Marine Hamburg, Hermann-Blohm-Strasse
Time of outage: {startTime}
Scope: {affectedSystems}

Current situation:
{symptoms}

Actions taken:
{actionsTaken}

Please respond immediately.

{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'power',
  },
  {
    id: 'incident-update',
    label: 'Incident Update / Follow-Up',
    subject: '[UPDATE] Incident Update \u2014 SKF Marine Hamburg \u2014 {affectedSystems}',
    body: `Dear Team,

This is an update regarding the ongoing incident at SKF Marine Hamburg.

Current status: {symptoms}
Actions taken since last update: {actionsTaken}
Estimated resolution time: {startTime}

We will continue to provide updates as the situation develops.

Best regards,
{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'general',
  },
  {
    id: 'nis2-escalation',
    label: 'NIS2 Security Incident Escalation',
    subject: '[NIS2 \u2014 SECURITY INCIDENT] SKF Marine Hamburg \u2014 Mandatory Reporting',
    body: `ATTENTION \u2014 Potential NIS2-relevant Security Incident

This incident may require mandatory reporting under NIS2 regulations.

Incident details:
- Description: {symptoms}
- Affected systems: {affectedSystems}
- Number of affected users: {userCount}
- Time of discovery: {startTime}
- Initial assessment: {initialAnalysis}

Please refer to the document "Vorgehensweise bei Sicherheitsvorfaellen" for the applicable criteria and reporting deadlines.

IMPORTANT: NIS2-relevant incidents have strict legal reporting deadlines. Please confirm receipt and next steps immediately.

{senderName}
IT Department \u2014 SKF Marine GmbH`,
    category: 'general',
  },
]

// ── Incident-Workflow-Schritte ────────────────────────────────────────────

export interface WorkflowStep {
  step: number
  title: string
  description: string
  timeLimit?: string
}

export const INCIDENT_WORKFLOW: WorkflowStep[] = [
  { step: 1, title: 'Analyse the Incident',             description: 'Determine scope: How many users are affected? Which systems/services are impacted?' },
  { step: 2, title: 'Identify Root Cause (max 10 min)',  description: 'Quick diagnosis \u2014 max 10 minutes for initial analysis. Key question: Is this a server, network, client, or power issue?', timeLimit: '10 minutes' },
  { step: 3, title: 'Check NIS2 Relevance',             description: 'Determine if this is a NIS2-relevant security incident. Consult the document "Vorgehensweise bei Sicherheitsvorfaellen" for criteria and mandatory reporting deadlines.' },
  { step: 4, title: 'Escalate \u2014 Contact Support',  description: 'If root cause is not clear after 10 minutes: contact the relevant support contacts listed below. When in doubt, contact multiple parties.' },
  { step: 5, title: 'Post Intranet Notification',       description: 'Publish a notification on the internal SharePoint.' },
]

// ── Platzhalter-Metadaten ─────────────────────────────────────────────────

export const PLACEHOLDER_META: Record<string, { label: string; type: 'text' | 'textarea' | 'select'; options?: string[] }> = {
  '{userCount}':       { label: 'Number of affected users',      type: 'text' },
  '{startTime}':       { label: 'Time of incident',              type: 'text' },
  '{affectedSystems}': { label: 'Affected systems/services',     type: 'text' },
  '{symptoms}':        { label: 'Symptoms / Problem description', type: 'textarea' },
  '{initialAnalysis}': { label: 'Initial analysis',              type: 'textarea' },
  '{actionsTaken}':    { label: 'Actions taken',                 type: 'textarea' },
  '{senderName}':      { label: 'Your name',                     type: 'text' },
  '{nis2Status}':      { label: 'NIS2 Status',                   type: 'select', options: ['Under review', 'Confirmed NIS2-relevant', 'Not NIS2-relevant'] },
}

// ══════════════════════════════════════════════════════════════════════════
// BERECHTIGUNGEN — Uebersicht fuer neue Mitarbeiter
// ══════════════════════════════════════════════════════════════════════════

export interface PermissionEntry {
  id: string
  name: string
  adGroupName: string | null
  snowLabel: string | null
  snowUrl: string | null
  section: 'standard' | 'homeoffice'
  notes?: string
}

export const PERMISSIONS: PermissionEntry[] = [
  // ── Standard-Berechtigungen ─────────────────────────────────────────────
  {
    id: 'perm-xelion',
    name: 'Xelion',
    adGroupName: 'Xelion 8.5.24061.0(1) ENG_Win10',
    snowLabel: 'Xelion 8 - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=b7ab5f9c874e1190c85f43b90cbb35d3&recordUrl=com.glideapp.servicecatalog_cat_item_view.do%3Fv%3D1&sysparm_id=b7ab5f9c874e1190c85f43b90cbb35d3',
    section: 'standard',
  },
  {
    id: 'perm-sap',
    name: 'SAP',
    adGroupName: null,
    snowLabel: 'SAP Business Client - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=c41eb4afc3558610d267bcdf050131e4',
    section: 'standard',
  },
  {
    id: 'perm-enaio',
    name: 'Enaio',
    adGroupName: null,
    snowLabel: 'Enaio Client with Office or Outlook Plugins - Marine - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=d89f9d80c3ab0e10e562d0ee050131c6&recordUrl=com.glideapp.servicecatalog_cat_item_view.do%3Fv%3D1&sysparm_id=d89f9d80c3ab0e10e562d0ee050131c6',
    section: 'standard',
  },
  {
    id: 'perm-seal',
    name: 'SEAL Add Printer',
    adGroupName: null,
    snowLabel: 'SealSystems PrinterWizardandInfoclient 5.0.0.26-x64 - Marine - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=3aab02de875fd554c85f43b90cbb3578',
    section: 'standard',
  },
  {
    id: 'perm-solidworks',
    name: 'Solid Works',
    adGroupName: 'FS_W3143_Solidworks PortaX Marine_STABI',
    snowLabel: 'Incident inkl. Info Konstruktionsberechtigung (z.B. Lager, Stabi usw.)',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&sys_id=f5ed584d4ff58b00d69105c18110c765',
    section: 'standard',
    notes: 'Requires specifying the department (e.g. Lager, Stabi)',
  },
  {
    id: 'perm-laufwerk-i',
    name: 'Laufwerk I:',
    adGroupName: 'DEHAM-W3172_700 Application_711 IT Allgemein-RW',
    snowLabel: 'Fileshare Access Request (select DE, Hamburg + required drive I:)',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=1db45ac8db0cf01098f90892f3961956',
    section: 'standard',
    notes: 'In SNOW: select location DE, Hamburg, then choose drive I:',
  },

  // ── Home Office Berechtigungen ──────────────────────────────────────────
  {
    id: 'perm-ho-sap',
    name: 'Remote Access to SAP',
    adGroupName: 'EAA_SAP_Marine_Prod',
    snowLabel: 'Add/Remove Remote Access to Applications for a User - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&sys_id=02973a8393df92949bdeba647aba1020',
    section: 'homeoffice',
  },
  {
    id: 'perm-ho-laufwerk-i',
    name: 'Remote Access to Drive I:',
    adGroupName: 'EAA_File_Servers_Marine_Prod',
    snowLabel: 'Fileshare Access Request - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=1db45ac8db0cf01098f90892f3961956',
    section: 'homeoffice',
  },
  {
    id: 'perm-ho-remote-intern',
    name: 'Remote Access (internal)',
    adGroupName: 'Azure_AD_SSO_Akamai_EAA_Client',
    snowLabel: 'ZPA Client Role: Request or Check or Change Remote Access for a User',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=0a02a0738796859059d9a8a90cbb3515&recordUrl=com.glideapp.servicecatalog_cat_item_view.do%3Fv%3D1&sysparm_id=0a02a0738796859059d9a8a90cbb3515',
    section: 'homeoffice',
  },
  {
    id: 'perm-ho-remote-extern',
    name: 'Remote Access (external)',
    adGroupName: 'Azure_AD_SSO_Akamai_EAA_3Pext',
    snowLabel: 'ZPA Client Role: Request or Check or Change Remote Access for a User',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&table=sc_cat_item&sys_id=0a02a0738796859059d9a8a90cbb3515&recordUrl=com.glideapp.servicecatalog_cat_item_view.do%3Fv%3D1&sysparm_id=0a02a0738796859059d9a8a90cbb3515',
    section: 'homeoffice',
  },
  {
    id: 'perm-ho-enaio',
    name: 'Remote Access to Enaio',
    adGroupName: 'EAA_Enaoi',
    snowLabel: 'Add/Remove Remote Access to Applications for a User - Service Portal',
    snowUrl: 'https://skfprod.service-now.com/sp?id=sc_cat_item&sys_id=02973a8393df92949bdeba647aba1020',
    section: 'homeoffice',
  },
]
