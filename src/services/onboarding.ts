// ── Onboarding-Dashboard – Service ────────────────────────────────────────────
// Konfiguration + Karten-Marker fuer das personalisierte Onboarding-Dashboard
// (selbstenthaltende HTML, die auf den Public Desktop des Mitarbeiter-PCs
// verteilt wird). Zentral auf dem Netzlaufwerk -> alle App-User sehen denselben
// Stand. Viele Inhalte (ServiceNow-URLs, Raum-Postfaecher, Fotos) werden vom
// Team nachgereicht -> alles editierbar mit Platzhaltern, die generierte HTML
// blendet Leeres sauber aus.
//
// Speicher:
//   onboarding/settings.json   → Links, Raeume, IT-Kontakt, Laufwerk-Mapping
//   onboarding/markers.json    → Gebaeude-Regionen, Etagen→Seiten, Pins, Routen

import { api } from '../electronAPI'

// ── Lagepläne (in der App gebuendelt, public/onboarding/plans/) ───────────────

export type PlanId = 'komplett' | 'verwaltung' | 'kopfbauwerk' | 'halle'

export const PLAN_IDS: PlanId[] = ['komplett', 'verwaltung', 'kopfbauwerk', 'halle']

/** Pfade relativ zum Vite-Root (fetch('./onboarding/…') zur Generierungszeit). */
export const PLAN_FILES: Record<PlanId, string> = {
  komplett: 'onboarding/plans/komplett-lageplan.pdf',
  verwaltung: 'onboarding/plans/verwaltungsgebaeude.pdf',
  kopfbauwerk: 'onboarding/plans/kopfbauwerk.pdf',
  halle: 'onboarding/plans/halle-1-11.pdf',
}

// Anzeige-Namen. Achtung: Im Komplett-Lageplan heissen die Gebaeude anders
// ("Nordanbau M I" = Kopfbauwerk, "Verwaltungsgebäude Ost" = Verwaltungsgebäude).
export const PLAN_LABELS: Record<PlanId, string> = {
  komplett: 'Komplett-Lageplan',
  verwaltung: 'Verwaltungsgebäude',
  kopfbauwerk: 'Kopfbauwerk',
  halle: 'Halle 1–11',
}

/** Gebaeude mit mehreren Etagen (vor dem Plan wird die Etage gewaehlt). */
export const MULTI_FLOOR_PLANS: PlanId[] = ['verwaltung', 'kopfbauwerk']

// ── Einstellungen ─────────────────────────────────────────────────────────────

export interface OnboardingLinks {
  orderHardwareSoftware: string  // ServiceNow Portal (Software & Hardware bestellen)
  createTicket: string           // Submit a Support Case (Incident)
  fileshareAccess: string        // Fileshare Access Request
  passwordReset: string          // MS Online-Kennwortzuruecksetzung
  mySignIns: string              // My Sign-Ins / Security Info
  itWiki: string                 // FAQ / IT-Wiki
  sharepoint: string             // SKF Marine Intranet
  canteenMenu: string            // Kantinenplan / Essenswochenplan (unter "Allgemeines")
  timeTracking: string           // Zeiterfassung (Kachel "Zeiterfassung")
}

export interface OnboardingRoom {
  id: string
  name: string
  capacity: number
  location: string     // z. B. "VGO-1", "Verwaltungsgebäude-4"
  mailbox: string      // Raum-Postfach (SMTP) — leer bis nachgereicht
  /** Foto: enthaelt '/' -> rel. Pfad auf dem Tool-Netzlaufwerk (Upload im Tool,
   *  onboarding/room-photos/…); sonst Legacy-Dateiname unter public/onboarding/rooms/. */
  photo?: string
}

export interface OnboardingContact {
  role: string
  name: string
  email: string
  phone: string
  department?: string   // leer = für alle sichtbar; sonst nur für Mitarbeiter dieser Abteilung
}

/** Ordner, der aus dem Dashboard heraus im Explorer geoeffnet werden kann.
 *  Der Link in der HTML traegt NUR den Listen-Index (skf-ordner:<i>) — die
 *  Pfade stehen ausschliesslich im mitverteilten Handler (open-folder.vbs). */
export interface FolderLink {
  id: string
  label: string
  path: string                  // UNC- oder lokaler Pfad
  section: 'it' | 'general'     // in welcher Kachel der Link erscheint
}

export interface OnboardingSettings {
  version: number
  links: OnboardingLinks
  driveMapping: {
    batPath: string        // UNC-Pfad zur Bat auf dem Public-Share
    manualCommand: string  // Fallback-Befehl zum Selber-Ausfuehren
  }
  rooms: OnboardingRoom[]
  itContact: { name: string; email: string; phone: string }
  generalInfo: { contacts: OnboardingContact[] }
  folderLinks: FolderLink[]
  updatedBy?: string
  updatedAt?: string
}

const SETTINGS_FILE = 'onboarding/settings.json'
const MARKERS_FILE = 'onboarding/markers.json'

export const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
  version: 1,
  links: {
    orderHardwareSoftware: '',   // ServiceNow-URL wird nachgereicht
    createTicket: '',
    fileshareAccess: '',
    passwordReset: 'https://passwordreset.microsoftonline.com',
    mySignIns: 'https://mysignins.microsoft.com/security-info',
    itWiki: '',
    sharepoint: '',
    canteenMenu: '',   // Link wird nachgepflegt
    timeTracking: '',  // Zeiterfassungs-Portal — Link wird nachgepflegt
  },
  driveMapping: {
    batPath: '\\\\w3172\\skf marine\\Public\\Public\\Davide\\Extras\\Dashboard\\Bat Dateien\\Laufwerk I Mapping.bat',
    manualCommand: 'net use I: "\\\\W3172\\SKF Marine" /persistent:no',
  },
  rooms: [
    { id: 'elbe',   name: 'Elbe',    capacity: 8,  location: 'VGO-1',                mailbox: '' },
    { id: 'alster', name: 'Alster',  capacity: 20, location: 'VGO-1',                mailbox: '' },
    { id: 'hafen',  name: 'Hafen',   capacity: 35, location: 'Verwaltungsgebäude-0', mailbox: '' },
    { id: 'port24', name: 'PORT 24', capacity: 24, location: 'Verwaltungsgebäude-4', mailbox: '' },
    { id: 'pier8',  name: 'PIER 8',  capacity: 8,  location: 'Verwaltungsgebäude-4', mailbox: '' },
    { id: 'dock12', name: 'DOCK 12', capacity: 12, location: 'Verwaltungsgebäude-4', mailbox: '' },
  ],
  itContact: { name: 'Deine IT', email: '', phone: '' },
  generalInfo: { contacts: [] },
  folderLinks: [],
}

export async function loadOnboardingSettings(): Promise<OnboardingSettings> {
  try {
    const s = await api().netReadJson<Partial<OnboardingSettings>>(SETTINGS_FILE)
    if (s && typeof s === 'object') {
      return {
        ...DEFAULT_ONBOARDING_SETTINGS,
        ...s,
        links: { ...DEFAULT_ONBOARDING_SETTINGS.links, ...(s.links ?? {}) },
        driveMapping: { ...DEFAULT_ONBOARDING_SETTINGS.driveMapping, ...(s.driveMapping ?? {}) },
        rooms: Array.isArray(s.rooms) && s.rooms.length > 0 ? s.rooms : DEFAULT_ONBOARDING_SETTINGS.rooms,
        itContact: { ...DEFAULT_ONBOARDING_SETTINGS.itContact, ...(s.itContact ?? {}) },
        generalInfo: { contacts: Array.isArray(s.generalInfo?.contacts) ? s.generalInfo!.contacts : [] },
        folderLinks: Array.isArray(s.folderLinks) ? s.folderLinks : [],
      }
    }
  } catch { /* noch keine Datei */ }
  return structuredClone(DEFAULT_ONBOARDING_SETTINGS)
}

export async function saveOnboardingSettings(s: OnboardingSettings, by: string): Promise<boolean> {
  const payload: OnboardingSettings = { ...s, updatedBy: by, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(SETTINGS_FILE, payload) } catch { return false }
}

// ── Karten-Marker ─────────────────────────────────────────────────────────────
// Alle Koordinaten normiert (0..1) relativ zur gerenderten PDF-Seite — dadurch
// unabhaengig von Render-Aufloesung (gleiche Konvention wie Access Points).

export interface MapRegion {
  id: string
  planId: PlanId          // auf welchem Plan liegt das Rechteck (immer 'komplett')
  page: number
  label: string           // sprechender Name ("Kopfbauwerk", nicht "Nordanbau M I")
  targetPlanId: PlanId    // welcher Plan beim Klick geoeffnet wird
  rect: { x: number; y: number; w: number; h: number }
}

export interface FloorPage {
  floor: string   // "EG", "1", "2", …
  page: number    // PDF-Seite (1-basiert)
}

export interface MapPin {
  id: string
  kind: 'destination' | 'room' | 'entrance'
  planId: PlanId
  page: number
  x: number
  y: number
  label: string
  roomNumber?: string   // fuer kind='room': Raumnummer zum Matchen (z. B. "210")
  buildingId?: PlanId   // fuer kind='entrance': Eingang WELCHES Gebaeudes (Pin liegt auf 'komplett')
}

export interface MapRoute {
  id: string
  fromPinId: string     // '' = beliebiger Start (allgemeine Wegbeschreibung)
  toPinId: string
  steps: string[]
}

export interface OnboardingMarkers {
  version: number
  regions: MapRegion[]
  floors: Partial<Record<PlanId, FloorPage[]>>
  pins: MapPin[]
  routes: MapRoute[]
  updatedBy?: string
  updatedAt?: string
}

export const DEFAULT_ONBOARDING_MARKERS: OnboardingMarkers = {
  version: 1,
  regions: [],
  floors: {},
  pins: [],
  routes: [],
}

/** Die vier festen Ziele, die die IT im Karten-Editor als Pins setzen soll. */
export const DESTINATION_PRESETS: { label: string; hint: string }[] = [
  { label: 'Personalbüro', hint: 'Kopfbauwerk, Raum 210' },
  { label: 'Kantine',      hint: 'Kopfbauwerk, Raum 215' },
  { label: 'Betriebsrat',  hint: 'Kopfbauwerk, Raum 214' },
  { label: 'Empfang',      hint: 'Komplett-Lageplan, A.2.27' },
]

export async function loadOnboardingMarkers(): Promise<OnboardingMarkers> {
  try {
    const m = await api().netReadJson<Partial<OnboardingMarkers>>(MARKERS_FILE)
    if (m && typeof m === 'object') {
      return {
        version: 1,
        regions: Array.isArray(m.regions) ? m.regions : [],
        floors: m.floors && typeof m.floors === 'object' ? m.floors : {},
        pins: Array.isArray(m.pins) ? m.pins : [],
        routes: Array.isArray(m.routes) ? m.routes : [],
        updatedBy: m.updatedBy, updatedAt: m.updatedAt,
      }
    }
  } catch { /* noch keine Datei */ }
  return structuredClone(DEFAULT_ONBOARDING_MARKERS)
}

export async function saveOnboardingMarkers(m: OnboardingMarkers, by: string): Promise<boolean> {
  const payload: OnboardingMarkers = { ...m, updatedBy: by, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(MARKERS_FILE, payload) } catch { return false }
}

// ── Raumfotos (Upload im Tool, zentral auf dem Netzlaufwerk) ──────────────────
// Fotos werden im Tool hochgeladen und unter onboarding/room-photos/ abgelegt —
// damit landen sie automatisch in JEDEM danach generierten Dashboard, egal
// welcher App-Nutzer es erstellt.

export const ROOM_PHOTO_DIR = 'onboarding/room-photos'

const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

/** Vergleichsschluessel fuer den Datei→Raum-Abgleich: "PORT 24" == "Port24.jpg". */
export function normalizeRoomKey(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Legt ein lokales Bild als zentrales Raumfoto ab. Liefert den rel. Pfad
 * (fuer OnboardingRoom.photo) oder null bei Fehler/ungueltigem Typ.
 */
export async function storeRoomPhotoFromFile(roomId: string, absPath: string): Promise<string | null> {
  const ext = (absPath.split('.').pop() || '').toLowerCase()
  if (!PHOTO_EXTS.includes(ext)) return null
  try {
    const read = await api().readFile(absPath)
    if (!read.success || !read.data) return null
    const rel = `${ROOM_PHOTO_DIR}/${roomId}.${ext === 'jpeg' ? 'jpg' : ext}`
    const ok = await api().netWriteRawFile(rel, read.data)
    return ok ? rel : null
  } catch { return null }
}

// ── Verteil-Protokoll ─────────────────────────────────────────────────────────
// Jede erfolgreiche (verifizierte) Verteilung wird zentral protokolliert, damit
// die Uebersicht sofort zeigt, wo das Dashboard schon liegt — zusaetzlich zum
// Live-Check per Test-Path.

export interface OnboardingDeployment {
  id: string
  personName: string
  employeeId?: string          // Verknuepfung zur Mitarbeiterverwaltung (falls neuer MA)
  hostname: string
  mode: 'new' | 'existing'
  deployedAt: string
  deployedBy: string
}

const DEPLOYMENTS_FILE = 'onboarding/deployments.json'

interface DeploymentStore { version: number; deployments: OnboardingDeployment[] }

export async function loadDeployments(): Promise<OnboardingDeployment[]> {
  try {
    const s = await api().netReadJson<DeploymentStore>(DEPLOYMENTS_FILE)
    if (s && Array.isArray(s.deployments)) return s.deployments
  } catch { /* noch keine Datei */ }
  return []
}

export async function addDeployment(d: Omit<OnboardingDeployment, 'id'>): Promise<void> {
  try {
    const all = await loadDeployments()
    // Pro Hostname nur den letzten Stand behalten (neuester Eintrag zuerst)
    const rest = all.filter(x => x.hostname.toLowerCase() !== d.hostname.toLowerCase())
    const entry: OnboardingDeployment = { ...d, id: newMarkerId('dep') }
    await api().netWriteJson(DEPLOYMENTS_FILE, { version: 1, deployments: [entry, ...rest] } satisfies DeploymentStore)
  } catch { /* Protokoll ist best effort */ }
}

// ── Helfer ────────────────────────────────────────────────────────────────────

/**
 * Etage aus einer Raumnummer ableiten: "E10" → "EG", "210" → "2", "1.05" → "1".
 * Liefert '' wenn nicht ableitbar.
 */
export function floorFromRoomNumber(room: string): string {
  const r = (room || '').trim()
  if (!r) return ''
  if (/^e/i.test(r)) return 'EG'
  const m = r.match(/^(\d)/)
  return m ? m[1] : ''
}

export function newMarkerId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
