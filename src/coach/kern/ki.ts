// Der Coach — vorbereitete Schnittstelle für eine spätere KI-Rückmeldung auf frei getippte Antworten.
// In diesem Auftrag ist nichts angeschlossen: Es gibt keinen Netzwerk-Code. Die Bausteine rufen `ki.bewerte` und
// fallen bei `null` auf Musterlösungen mit Selbstbewertung zurück.

export interface FreitextAuftrag { art: 'konter' | 'umformulieren' | 'anschluss' | 'kern' | 'spiegeln' | 'jaund' | 'humorlabor' | 'kritiker' | 'bauplan'; aufgabe: string; antwort: string; kriterien: string[] }
export interface FreitextUrteil { kriterien: Record<string, 0 | 1 | 2>; hinweis: string }
export interface Ki { verfuegbar(): boolean; bewerte(a: FreitextAuftrag): Promise<FreitextUrteil | null> }

export const ki: Ki = { verfuegbar: () => false, bewerte: async () => null }
