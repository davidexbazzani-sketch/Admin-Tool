// Übungskatalog: alle Übungen mit Beschreibung. Die Module selbst werden erst beim Öffnen
// geladen (jede Familie ist ein eigenes Teilpaket) — so bleibt der Brain Trainer klein und
// der Rest des Tools merkt nichts davon.
import type { Gebiet, KatalogEintrag } from './typen'

export const KATALOG: KatalogEintrag[] = [
  // ── Logik ──────────────────────────────────────────────────────────────────
  {
    id: 'matrizen', name: 'Figuren-Matrizen', gebiet: 'logik', art: 'fragen',
    kurz: 'Neun Felder, eines fehlt: Welche Figur passt?',
    trainiert: 'Regeln in Mustern erkennen und anwenden (schlussfolgerndes Denken) — die Aufgabenart der sprachfreien Intelligenztests.',
    bedienung: 'Antwort anklicken oder Taste 1–8.', dauer: 'ca. 4 Minuten', duell: true,
    lade: () => import('../aufgaben/matrizen'),
  },
  {
    id: 'zahlenreihen', name: 'Zahlenreihen', gebiet: 'logik', art: 'fragen',
    kurz: 'Welche Zahl setzt die Reihe fort?',
    trainiert: 'Gesetzmäßigkeiten in Zahlen finden — rechnerisch-logisches Denken.',
    bedienung: 'Antwort anklicken oder Taste 1–5.', dauer: 'ca. 4 Minuten', duell: true,
    lade: () => import('../aufgaben/zahlenreihen'),
  },
  {
    id: 'figurenfolgen', name: 'Figurenfolgen', gebiet: 'logik', art: 'fragen',
    kurz: 'Bilder verändern sich nach einer Regel: Wie sieht das nächste aus?',
    trainiert: 'Mehrere Veränderungen gleichzeitig verfolgen und fortsetzen (figural-logisches Denken).',
    bedienung: 'Antwort anklicken oder Taste 1–6.', dauer: 'ca. 4 Minuten',
    lade: () => import('../aufgaben/figurenfolgen'),
  },
  {
    id: 'schluss', name: 'Schlussfolgern', gebiet: 'logik', art: 'fragen',
    kurz: 'Was folgt zwingend aus den Aussagen — und was nur scheinbar?',
    trainiert: 'Sauberes logisches Schließen: Reihenfolgen, Alle/Einige/Keine und Wenn-dann-Aussagen, samt der typischen Fehlschlüsse.',
    bedienung: 'Antwort anklicken oder Zifferntaste.', dauer: 'ca. 5 Minuten',
    lade: () => import('../aufgaben/schluss'),
  },
  {
    id: 'passtnicht', name: 'Was passt nicht?', gebiet: 'logik', art: 'fragen',
    kurz: 'Fünf Bilder, vier haben etwas gemeinsam. Welches fällt heraus?',
    trainiert: 'Die verborgene Gemeinsamkeit selbst finden — Klassifizieren und Abstrahieren.',
    bedienung: 'Bild anklicken oder Taste 1–5.', dauer: 'ca. 3 Minuten',
    lade: () => import('../aufgaben/passtnicht'),
  },

  // ── Gedächtnis ─────────────────────────────────────────────────────────────
  {
    id: 'merkfolge', name: 'Merkfolge', gebiet: 'gedaechtnis', art: 'fragen', anzahl: 8,
    kurz: 'Eine Zeichenfolge erscheint kurz — danach kommt eine Frage dazu.',
    trainiert: 'Kurzzeitiges Behalten und Abrufen einer Reihenfolge, ab Stufe 4 auch das Umordnen im Kopf.',
    bedienung: 'Einprägen, dann Antwort anklicken oder Zifferntaste.', dauer: 'ca. 3 Minuten',
    lade: () => import('../aufgaben/merkfolge'),
  },
  {
    id: 'nback', name: 'N-Back', gebiet: 'gedaechtnis', art: 'frei',
    kurz: 'Ein Feld nach dem anderen leuchtet auf: Ist es dasselbe wie vor n Schritten?',
    trainiert: 'Arbeitsgedächtnis: die letzten Positionen behalten und bei jedem Schritt erneuern, ohne auf nur „bekannt wirkende“ Felder hereinzufallen.',
    bedienung: 'Leertaste oder „Treffer“ drücken, wenn das Feld dasselbe ist wie vor n Schritten – sonst nichts tun.',
    dauer: 'ca. 1 Minute',
    lade: () => import('../uebungen/gedaechtnis/NBack'),
  },
  {
    id: 'zahlenspanne', name: 'Zahlenspanne', gebiet: 'gedaechtnis', art: 'frei',
    kurz: 'Ziffern erscheinen einzeln – danach tippst du sie ein: vorwärts oder, auf höheren Stufen, rückwärts.',
    trainiert: 'Kurzzeitgedächtnis für Folgen; rückwärts kommt das Umordnen im Kopf dazu (Arbeitsgedächtnis).',
    bedienung: 'Ziffern tippen oder anklicken, Rücktaste löscht, Enter bestätigt.',
    dauer: 'ca. 1 Minute',
    lade: () => import('../uebungen/gedaechtnis/Zahlenspanne'),
  },
  {
    id: 'corsi', name: 'Blockspanne', gebiet: 'gedaechtnis', art: 'frei',
    kurz: 'Blöcke leuchten nacheinander auf – klicke sie in derselben oder, auf höheren Stufen, in umgekehrter Reihenfolge an.',
    trainiert: 'Räumliches Kurzzeitgedächtnis: Orte und ihre Reihenfolge behalten, ohne sie in Worte fassen zu können.',
    bedienung: 'Blöcke anklicken; die Rücktaste nimmt den letzten Klick zurück.',
    dauer: 'ca. 1 Minute',
    lade: () => import('../uebungen/gedaechtnis/Corsi'),
  },
  {
    id: 'muster', name: 'Muster merken', gebiet: 'gedaechtnis', art: 'frei',
    kurz: 'Ein Gitter zeigt kurz ein Muster – markiere danach dieselben Felder.',
    trainiert: 'Visuelles Kurzzeitgedächtnis: ein Bild auf einen Blick erfassen und behalten.',
    bedienung: 'Felder anklicken (nochmal klicken wählt ab); Enter schließt vorzeitig ab.',
    dauer: 'ca. 1 Minute',
    lade: () => import('../uebungen/gedaechtnis/MusterMerken'),
  },
  {
    id: 'paare', name: 'Paare merken', gebiet: 'gedaechtnis', art: 'frei',
    kurz: 'Zwei Karten aufdecken und alle Paare mit möglichst wenigen Zügen finden.',
    trainiert: 'Merken, was wo liegt – über viele Züge hinweg und gegen immer neue Eindrücke.',
    bedienung: 'Karten anklicken; ein falsches Paar dreht sich von selbst wieder um.',
    dauer: 'ca. 1–3 Minuten',
    lade: () => import('../uebungen/gedaechtnis/Paare'),
  },

  // ── Raum ───────────────────────────────────────────────────────────────────
  {
    id: 'rotation', name: 'Mentale Rotation', gebiet: 'raum', art: 'fragen',
    kurz: 'Welche Figur ist dieselbe — nur gedreht?',
    trainiert: 'Figuren im Kopf drehen und von ihrem Spiegelbild unterscheiden (räumliches Vorstellen).',
    bedienung: 'Antwort anklicken oder Taste 1–6.', dauer: 'ca. 3 Minuten', duell: true,
    lade: () => import('../aufgaben/rotation'),
  },
  {
    id: 'spiegel', name: 'Spiegelbild', gebiet: 'raum', art: 'fragen',
    kurz: 'Die Figur wird an einer Linie gespiegelt. Wie sieht sie danach aus?',
    trainiert: 'Spiegeln im Kopf — an senkrechten, waagerechten und schrägen Achsen.',
    bedienung: 'Antwort anklicken oder Taste 1–6.', dauer: 'ca. 3 Minuten',
    lade: () => import('../aufgaben/spiegel'),
  },
  {
    id: 'wuerfel', name: 'Würfelnetze', gebiet: 'raum', art: 'fragen',
    kurz: 'Ein flaches Netz wird zum Würfel gefaltet. Was liegt wo?',
    trainiert: 'Aus der Fläche in den Raum denken: Flächen im Kopf falten und ihre Lage zueinander bestimmen.',
    bedienung: 'Antwort anklicken oder Taste 1–5.', dauer: 'ca. 5 Minuten',
    lade: () => import('../aufgaben/wuerfel'),
  },
  {
    id: 'falten', name: 'Papier falten', gebiet: 'raum', art: 'fragen',
    kurz: 'Ein Blatt wird gefaltet und gelocht. Wie sieht es aufgefaltet aus?',
    trainiert: 'Mehrere Schritte im Kopf rückwärts abspielen (räumliches Vorstellen in Folge).',
    bedienung: 'Antwort anklicken oder Taste 1–6.', dauer: 'ca. 5 Minuten',
    lade: () => import('../aufgaben/falten'),
  },

  // ── Zahlen ─────────────────────────────────────────────────────────────────
  {
    id: 'kopfrechnen', name: 'Kopfrechnen', gebiet: 'zahlen', art: 'fragen', anzahl: 12,
    kurz: 'Rechnen ohne Zettel — vom kleinen Einmaleins bis zu großen Produkten.',
    trainiert: 'Rechenfertigkeit und das Halten von Zwischenergebnissen.',
    bedienung: 'Ergebnis tippen, mit Enter bestätigen.', dauer: 'ca. 3 Minuten', duell: true,
    lade: () => import('../aufgaben/kopfrechnen'),
  },
  {
    id: 'schaetzen', name: 'Schätzen', gebiet: 'zahlen', art: 'fragen', anzahl: 12,
    kurz: 'Nicht ausrechnen — überschlagen: Welcher Wert liegt am nächsten?',
    trainiert: 'Zahlengefühl: Größenordnungen schnell und sicher einschätzen.',
    bedienung: 'Antwort anklicken oder Taste 1–4.', dauer: 'ca. 3 Minuten', duell: true,
    lade: () => import('../aufgaben/schaetzen'),
  },
  {
    id: 'textaufgaben', name: 'Textaufgaben', gebiet: 'zahlen', art: 'fragen', anzahl: 8,
    kurz: 'Aus einem kurzen Text die richtige Rechnung herauslesen.',
    trainiert: 'Rechnerisches Denken: Zusammenhänge erfassen (Dreisatz, Prozent, Zeit und Weg) und typische Denkfallen vermeiden.',
    bedienung: 'Antwort anklicken oder Taste 1–5.', dauer: 'ca. 6 Minuten',
    lade: () => import('../aufgaben/textaufgaben'),
  },
  {
    id: 'rechenkette', name: 'Rechenkette', gebiet: 'zahlen', art: 'frei',
    kurz: 'Eine Startzahl, dann kommen Rechenschritte einzeln. Im Kopf mitrechnen!',
    trainiert: 'Ein Zwischenergebnis im Kopf halten und fortlaufend verändern (Rechnen plus Arbeitsgedächtnis).',
    bedienung: 'Zusehen und mitrechnen, am Ende das Ergebnis tippen und Enter.', dauer: 'ca. 2 Minuten',
    lade: () => import('../uebungen/zahlen/Rechenkette'),
  },
  {
    id: 'zielzahl', name: 'Zielzahl', gebiet: 'zahlen', art: 'frei',
    kurz: 'Aus den Zahlen mit + − · : die Zielzahl bilden.',
    trainiert: 'Flexibles Kombinieren und Vorausplanen mit Zahlen.',
    bedienung: 'Zahl, Rechenzeichen, zweite Zahl anklicken — sie verschmelzen zum Ergebnis.', dauer: 'ca. 4 Minuten',
    lade: () => import('../uebungen/zahlen/Zielzahl'),
  },

  // ── Geographie ─────────────────────────────────────────────────────────────
  {
    id: 'landfinden', name: 'Land finden', gebiet: 'geo', art: 'frei',
    kurz: 'Wo liegt …? Das gesuchte Land auf der Karte anklicken.',
    trainiert: 'Lagewissen: Länder auf der Europa-, Erdteil- und Weltkarte schnell wiederfinden.',
    bedienung: 'Land anklicken. Mausrad oder + / − zoomt, Ziehen verschiebt die Karte; nach einem Fehler geht es mit Klick oder Enter weiter.',
    dauer: 'ca. 1–2 Minuten', duell: true,
    lade: () => import('../uebungen/geo/LandFinden'),
  },
  {
    id: 'hauptstaedte', name: 'Hauptstädte', gebiet: 'geo', art: 'fragen',
    kurz: 'Welche Hauptstadt gehört zu welchem Land?',
    trainiert: 'Faktenwissen abrufen: Hauptstädte und Länder einander zuordnen, auch gegen naheliegende Verwechslungen.',
    bedienung: 'Antwort anklicken oder Taste 1–4.', dauer: 'ca. 2 Minuten', duell: true,
    lade: () => import('../aufgaben/hauptstaedte'),
  },
  {
    id: 'umriss', name: 'Umrisse', gebiet: 'geo', art: 'fragen',
    kurz: 'Welches Land hat diesen Umriss?',
    trainiert: 'Formen wiedererkennen: die Gestalt eines Landes ohne Karte und Nachbarn zuordnen.',
    bedienung: 'Antwort anklicken oder Taste 1–4.', dauer: 'ca. 2–3 Minuten',
    lade: () => import('../aufgaben/geoUmriss'),
  },
  {
    id: 'geowissen', name: 'Geo-Wissen', gebiet: 'geo', art: 'fragen',
    kurz: 'Erdteile, Nachbarländer und Größenvergleiche.',
    trainiert: 'Räumliches Faktenwissen: auf welchem Erdteil ein Land liegt, an wen es grenzt und wie groß es ist.',
    bedienung: 'Antwort anklicken oder Taste 1–6.', dauer: 'ca. 2–3 Minuten',
    lade: () => import('../aufgaben/geoWissen'),
  },

  // ── Tempo ──────────────────────────────────────────────────────────────────
  {
    id: 'schulte', name: 'Schulte-Tabelle', gebiet: 'tempo', art: 'frei',
    kurz: 'Zahlen im gemischten Gitter der Reihe nach finden.',
    trainiert: 'Schnelles Absuchen des Blickfelds und Blicksteuerung.',
    bedienung: 'Die gesuchte Zahl anklicken.', dauer: 'ca. 1–2 Minuten',
    lade: () => import('../uebungen/tempo/Schulte'),
  },
  {
    id: 'reaktion', name: 'Reaktionszeit', gebiet: 'tempo', art: 'frei',
    kurz: 'Auf ein Signal so schnell wie möglich reagieren — erst einfach, dann nach Pfeilrichtung und mit „Stopp“.',
    trainiert: 'Reaktionsgeschwindigkeit; ab Stufe 4 die schnelle Wahl zwischen mehreren Antworten, ab Stufe 8 zusätzlich das Zurückhalten einer schon vorbereiteten Reaktion.',
    bedienung: 'Stufe 1–3: Leertaste oder Klick ins Feld, sobald es aufleuchtet. Ab Stufe 4: Pfeiltasten oder die Pfeil-Knöpfe. Nie vor dem Signal drücken.',
    dauer: 'ca. ½ Minute',
    lade: () => import('../uebungen/tempo/Reaktion'),
  },
  {
    id: 'symbolsuche', name: 'Symbol-Suche', gebiet: 'tempo', art: 'frei',
    kurz: 'Zwei Zeichen links, eine Reihe rechts: Kommt eines der beiden darin vor?',
    trainiert: 'Wahrnehmungstempo: abstrakte Formen schnell und genau vergleichen und dabei zwei Suchzeichen kurz im Kopf behalten.',
    bedienung: 'Taste J = Ja, Taste N = Nein (oder die Knöpfe). Richtig +1, falsch −1.',
    dauer: '1 Minute', duell: true,
    lade: () => import('../uebungen/tempo/SymbolSuche'),
  },
  {
    id: 'zahlensymbol', name: 'Zahlen-Symbol-Code', gebiet: 'tempo', art: 'frei',
    kurz: 'Eine Legende ordnet neun Zeichen die Ziffern 1–9 zu — zu jedem gezeigten Zeichen die passende Ziffer drücken.',
    trainiert: 'Verarbeitungstempo: ein Zeichen erkennen, seine Ziffer nachschlagen oder merken und zügig umsetzen.',
    bedienung: 'Tasten 1–9 (auch Ziffernblock) oder die Ziffernfelder anklicken. Richtig +1, falsch −1.',
    dauer: '1 Minute', duell: true,
    lade: () => import('../uebungen/tempo/ZahlenSymbol'),
  },
  {
    id: 'verbinden', name: 'Zahlen verbinden', gebiet: 'tempo', art: 'frei',
    kurz: 'Verstreute Kreise der Reihe nach anklicken — ab Stufe 6 Zahlen und Buchstaben im Wechsel (1 – A – 2 – B …).',
    trainiert: 'Schnelles Absuchen eines Felds; im Wechsel von Zahlen und Buchstaben zusätzlich das Umschalten zwischen zwei Reihenfolgen.',
    bedienung: 'Die Kreise der Reihe nach anklicken. Ein falscher Kreis kostet 1 Sekunde.',
    dauer: 'ca. 1–2 Minuten',
    lade: () => import('../uebungen/tempo/Verbinden'),
  },

  // ── Aufmerksamkeit ─────────────────────────────────────────────────────────
  {
    id: 'stroop', name: 'Farbwort (Stroop)', gebiet: 'aufmerksamkeit', art: 'frei',
    kurz: 'Ein Farbwort in bunter Schrift: Welche Farbe hat die Schrift – egal, was dort steht?',
    trainiert: 'Eine eingeschliffene Reaktion (das Lesen) unterdrücken und auf das Verlangte antworten – die Kontrolle über störende Reize.',
    bedienung: 'Tasten D F J K für Rot, Blau, Grün, Gelb oder die Knöpfe anklicken. Ab Stufe 8 sagt ein Hinweis, ob die Farbe oder das Wort gilt. Bei einer Rot-Grün-Schwäche ist diese Übung deutlich schwerer.',
    dauer: 'ca. 1 Minute', duell: true,
    lade: () => import('../uebungen/aufmerksamkeit/Stroop'),
  },
  {
    id: 'gonogo', name: 'Go / No-Go', gebiet: 'aufmerksamkeit', art: 'frei',
    kurz: 'Figuren im schnellen Takt: fast immer drücken – bei bestimmten Figuren gerade nicht.',
    trainiert: 'Eine schon angelaufene Handlung rechtzeitig stoppen (Reaktionshemmung) und dabei wach bleiben.',
    bedienung: 'Leertaste oder den großen Knopf drücken; bei einer No-Go-Figur nichts tun. Die Regel steht die ganze Zeit oben.',
    dauer: 'ca. ½–1 Minute',
    lade: () => import('../uebungen/aufmerksamkeit/GoNoGo'),
  },
  {
    id: 'flanker', name: 'Flanker-Pfeile', gebiet: 'aufmerksamkeit', art: 'frei',
    kurz: 'Fünf Pfeile in einer Reihe: Wohin zeigt der mittlere?',
    trainiert: 'Den Blick auf das Wichtige richten und störende Nachbarn ausblenden (selektive Aufmerksamkeit).',
    bedienung: 'Pfeiltasten ← / → oder die beiden Knöpfe.',
    dauer: 'ca. 1 Minute',
    lade: () => import('../uebungen/aufmerksamkeit/Flanker'),
  },
  {
    id: 'wechsel', name: 'Aufgabenwechsel', gebiet: 'aufmerksamkeit', art: 'frei',
    kurz: 'Eine Ziffer, zwei Fragen im Wechsel: gerade oder ungerade – oder größer oder kleiner als 5?',
    trainiert: 'Schnell zwischen zwei Regeln umschalten (geistige Beweglichkeit) – jeder Wechsel kostet messbar Zeit.',
    bedienung: '← = ungerade bzw. kleiner als 5, → = gerade bzw. größer als 5. Welche Frage gilt, zeigen der Text und die Form des Rahmens.',
    dauer: 'ca. 1–2 Minuten',
    lade: () => import('../uebungen/aufmerksamkeit/Wechsel'),
  },

  // ── Sprache ────────────────────────────────────────────────────────────────
  {
    id: 'analogien', name: 'Wort-Analogien', gebiet: 'sprache', art: 'fragen',
    kurz: 'Hand : Finger = Fuß : ? — welches Wort ergänzt die Gleichung?',
    trainiert: 'Beziehungen zwischen Begriffen erkennen und auf ein anderes Wortpaar übertragen (sprachlich-schlussfolgerndes Denken).',
    bedienung: 'Antwort anklicken oder Taste 1–5.', dauer: 'ca. 3 Minuten', duell: true,
    lade: () => import('../aufgaben/analogien'),
  },
  {
    id: 'synonyme', name: 'Synonym / Gegenteil', gebiet: 'sprache', art: 'fragen',
    kurz: 'Welches Wort bedeutet dasselbe – oder das Gegenteil?',
    trainiert: 'Wortschatz und das genaue Unterscheiden von Wortbedeutungen.',
    bedienung: 'Antwort anklicken oder Taste 1–4. „≈“ fragt nach dem gleichbedeutenden, „↔“ nach dem gegenteiligen Wort.', dauer: 'ca. 2–3 Minuten', duell: true,
    lade: () => import('../aufgaben/synonyme'),
  },
  {
    id: 'oberbegriff', name: 'Wortgruppen', gebiet: 'sprache', art: 'fragen',
    kurz: 'Fünf Wörter, eines gehört nicht dazu – oder: Welcher Oberbegriff passt zu allen?',
    trainiert: 'Begriffe nach ihrer Bedeutung ordnen und das gemeinsame Merkmal finden (Kategorienbildung).',
    bedienung: 'Antwort anklicken oder Taste 1–5.', dauer: 'ca. 3 Minuten',
    lade: () => import('../aufgaben/oberbegriff'),
  },
  {
    id: 'anagramme', name: 'Anagramme', gebiet: 'sprache', art: 'frei',
    kurz: 'Durcheinandergeratene Buchstaben: Welches Wort steckt darin?',
    trainiert: 'Schneller Zugriff auf den Wortschatz und flexibles Umordnen von Buchstaben im Kopf.',
    bedienung: 'Buchstaben der Reihe nach anklicken oder tippen; ⌫ nimmt den letzten zurück, Entf alle.', dauer: 'ca. 2–4 Minuten', duell: true,
    lade: () => import('../uebungen/sprache/Anagramme'),
  },

  // ── Rätsel ─────────────────────────────────────────────────────────────────
  {
    id: 'sudoku', name: 'Sudoku', gebiet: 'raetsel', art: 'frei',
    kurz: 'Jede Ziffer genau einmal je Zeile, Spalte und Kästchen.',
    trainiert: 'Schlussfolgerndes Ausschließen: mehrere Bedingungen zugleich im Blick behalten und daraus die einzig mögliche Ziffer ableiten.',
    bedienung: 'Feld anklicken, dann Ziffer wählen (Ziffernfeld oder Tasten 1–9). Pfeiltasten wandern, Entf löscht, Z nimmt zurück, N schaltet Notizen.',
    dauer: 'ca. 1–15 Minuten', lang: true,
    lade: () => import('../uebungen/raetsel/Sudoku'),
  },
  {
    id: 'nonogramm', name: 'Nonogramm', gebiet: 'raetsel', art: 'frei',
    kurz: 'Aus den Zahlen an Zeilen und Spalten das versteckte Bild erschließen.',
    trainiert: 'Logisches Kombinieren: Bedingungen aus zwei Richtungen zusammenführen und sichere Felder ableiten, ohne zu raten.',
    bedienung: 'Linksklick füllt ein Feld, Rechtsklick markiert es als leer; ziehen malt mehrere Felder. Taste X tauscht die Maustasten.',
    dauer: 'ca. 1–8 Minuten', lang: true,
    lade: () => import('../uebungen/raetsel/Nonogramm'),
  },
  {
    id: 'lichteraus', name: 'Lichter aus', gebiet: 'raetsel', art: 'frei',
    kurz: 'Ein Klick schaltet ein Feld und seine Nachbarn um — mach alle Lichter aus.',
    trainiert: 'Vorausschauendes Planen: die Wirkung mehrerer Schritte im Kopf überlagern, bevor man klickt.',
    bedienung: 'Feld anklicken. Taste R setzt das Brett zurück (die Klicks zählen weiter).',
    dauer: 'ca. 1–3 Minuten',
    lade: () => import('../uebungen/raetsel/LichterAus'),
  },
  {
    id: 'schiebepuzzle', name: 'Schiebepuzzle', gebiet: 'raetsel', art: 'frei',
    kurz: 'Steine über die Lücke verschieben, bis die Zahlen der Reihe nach stehen.',
    trainiert: 'Räumliches Vorausplanen in Zugfolgen: Was verschiebt sich mit, wenn ein Stein an seinen Platz soll?',
    bedienung: 'Stein neben der Lücke anklicken oder Pfeiltasten (der Pfeil zeigt, wohin der Stein rutscht).',
    dauer: 'ca. 1–3 Minuten',
    lade: () => import('../uebungen/raetsel/Schiebepuzzle'),
  },
  {
    id: 'hanoi', name: 'Türme von Hanoi', gebiet: 'raetsel', art: 'frei',
    kurz: 'Den Scheibenturm umsetzen — nie eine größere Scheibe auf eine kleinere.',
    trainiert: 'Planen in Teilzielen: eine Aufgabe in kleinere zerlegen und den eigenen Plan über viele Züge im Kopf behalten.',
    bedienung: 'Stab anklicken (hebt die oberste Scheibe an), dann den Zielstab — oder die Tasten 1, 2, 3.',
    dauer: 'ca. 1–5 Minuten',
    lade: () => import('../uebungen/raetsel/Hanoi'),
  },
  {
    id: 'codeknacken', name: 'Code knacken', gebiet: 'raetsel', art: 'frei',
    kurz: 'Einen geheimen Farbcode aus den Rückmeldungen zu deinen Tipps erschließen.',
    trainiert: 'Schlussfolgerndes Denken: Vermutungen aufstellen, gezielt prüfen und aus den Rückmeldungen Möglichkeiten ausschließen.',
    bedienung: 'Farbe anklicken oder Taste 1–8, Enter prüft den Tipp, Rück löscht. Jeder Stift trägt seine Ziffer.',
    dauer: 'ca. 2–4 Minuten',
    lade: () => import('../uebungen/raetsel/CodeKnacken'),
  },
]

export const uebung = (id: string): KatalogEintrag | undefined => KATALOG.find(u => u.id === id)
export const uebungenVon = (g: Gebiet): KatalogEintrag[] => KATALOG.filter(u => u.gebiet === g)
export const DUELL_DISZIPLINEN = (): KatalogEintrag[] => KATALOG.filter(u => u.duell)
