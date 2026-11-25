// Terra Incognita — Ereignisse auf See. Jedes hat zwei bis drei Antworten; was daraus wird, entscheidet ein fester
// Wurf aus dem Spielstand (dieselbe Lage ergibt dasselbe Ergebnis — kein Neuladen-Trick).
// Wirkungen: siehe kern/wirkung.ts. Klima: 0 = gemäßigt, 1 = kalt, 2 = warm.
import type { Bedarf, Wirkung } from '../kern/wirkung'

export interface Ausgang { p: number; text: string; w?: Wirkung }
export interface Wahl { text: string; braucht?: Bedarf; aus: readonly Ausgang[] }
export interface Ereignis {
  id: string
  titel: string
  text: string
  /** Stimmungsbild (Dateiname ohne Endung in public/terra/bilder) */
  bild?: string
  gewicht: number
  klima?: readonly number[]
  abStufe?: number
  nurGebiet?: readonly number[]
  /** nur, wenn der Proviant unter diesem Anteil (Prozent) liegt */
  proviantUnter?: number
  wahl: readonly Wahl[]
}

export const EREIGNISSE: readonly Ereignis[] = [
  { id: 'flaute', titel: 'Flaute', bild: 'see', gewicht: 10,
    text: 'Der Wind schläft ein. Die Segel hängen schlaff, das Meer liegt wie Öl. Irgendwo knarrt eine Planke. Sonst nichts.',
    wahl: [
      { text: 'Abwarten und Tee trinken', aus: [{ p: 60, text: 'Am nächsten Morgen kräuselt eine Brise das Wasser. Weiter geht es.', w: { stunden: 14 } }, { p: 40, text: 'Zwei Tage Stille. Die Mannschaft kennt jetzt jedes Lied auswendig.', w: { stunden: 30 } }] },
      { text: 'Das Beiboot aussetzen und schleppen', aus: [{ p: 70, text: 'Schweißtreibend, aber es hilft: Nach einigen Stunden erreicht das Schiff den Rand der Flaute.', w: { stunden: 6 } }, { p: 30, text: 'Die Männer rudern sich die Hände wund – und der Wind kommt genau dann zurück, als sie aufgeben.', w: { stunden: 12 } }] },
      { text: 'Nach dem Wind pfeifen lassen', braucht: { rolle: 'navigator' }, aus: [{ p: 100, text: 'Der Navigator deutet auf einen dunklen Streifen am Horizont: «Dort steht Wind.» Zwei Stunden später füllen sich die Segel.', w: { stunden: 2 } }] },
    ] },
  { id: 'schiffbruechiger', titel: 'Mann über Bord – ein fremder', bild: 'see', gewicht: 8,
    text: 'Der Ausguck ruft: Ein Floß aus Fässern treibt voraus, darauf eine Gestalt, die schwach den Arm hebt.',
    wahl: [
      { text: 'An Bord nehmen', aus: [
        { p: 40, text: 'Der Mann war Matrose auf einem Kauffahrer. Als er wieder sprechen kann, erzählt er von seiner letzten Reise.', w: { proviant: -12, ruhm: 10, geruecht: 1 } },
        { p: 30, text: 'Ein Fischer, abgetrieben im Sturm. Zum Dank zeigt er, wo die Schwärme stehen – das Netz kommt voll herauf.', w: { proviant: 20, ruhm: 10 } },
        { p: 30, text: 'Der Gerettete ist ein Zeichner der Gilde. Seine wasserfeste Mappe enthält Skizzen einer Küste in der Nähe.', w: { proviant: -12, ruhm: 10, aufdecken: 4 } },
      ] },
      { text: 'Wasser und Brot hinüberwerfen', aus: [{ p: 100, text: 'Er fängt den Sack, winkt – und deutet in die Richtung, aus der er kam. Dort muss Land sein.', w: { proviant: -6, ruhm: 4 } }] },
      { text: 'Kurs halten', aus: [{ p: 100, text: 'Das Floß bleibt achteraus. An diesem Abend redet niemand viel.' }] },
    ] },
  { id: 'walherde', titel: 'Wale voraus', bild: 'see', gewicht: 9,
    text: 'Blas an Blas steht über dem Wasser: eine Herde zieht quer zum Kurs. Die Rücken glänzen wie nasser Schiefer.',
    wahl: [
      { text: 'Beidrehen und zeichnen', aus: [{ p: 100, text: 'Eine Stunde lang ist das Schiff von Riesen umgeben. Der Kartograph füllt drei Seiten.', w: { stunden: 5, tier: 2 } }] },
      { text: 'Vorsichtig hindurchsegeln', aus: [{ p: 80, text: 'Die Tiere weichen gelassen aus. Ein Kalb beäugt das Ruderblatt.', w: { tier: 1 } }, { p: 20, text: 'Ein Bulle taucht unter dem Kiel hindurch und streift ihn. Das ganze Schiff zittert.', w: { rumpf: -1, tier: 1 } }] },
    ] },
  { id: 'haendler', titel: 'Ein Segel am Horizont', bild: 'see', gewicht: 8,
    text: 'Ein dickbäuchiger Kauffahrer dreht bei und setzt die Handelsflagge. Der Schiffer ruft herüber, ob man tauschen wolle.',
    wahl: [
      { text: 'Proviant kaufen (25 Gold)', braucht: { gold: 25 }, aus: [{ p: 100, text: 'Zwei Fässer Zwieback und eine Speckseite wechseln das Schiff. Teuer, aber auf See gibt es keinen zweiten Laden.', w: { gold: -25, proviant: 60 } }] },
      { text: 'Neuigkeiten austauschen', aus: [{ p: 70, text: 'Bei einem Becher Rum packt der Schiffer aus, was er unterwegs gesehen hat.', w: { geruecht: 1 } }, { p: 30, text: 'Der Schiffer weiß nichts Neues, dafür viel Altes. Es dauert.', w: { stunden: 4 } }] },
      { text: 'Grüßen und weitersegeln', aus: [{ p: 100, text: 'Die Flaggen dippen zum Gruß. Dann ist das Meer wieder leer.' }] },
    ] },
  { id: 'sturm', titel: 'Das Wetter schlägt um', bild: 'sturm', gewicht: 9,
    text: 'Im Westen wächst eine schwarze Wand. Der Wind dreht, die ersten Böen reißen an den Tauen. In einer Stunde ist es hier.',
    wahl: [
      { text: 'Segel reffen und abwettern', aus: [{ p: 75, text: 'Eine Nacht lang reitet das Schiff die Seen ab. Am Morgen ist alles nass, aber alles noch da.', w: { stunden: 18 } }, { p: 25, text: 'Eine Sturzsee nimmt ein Stück Reling mit.', w: { stunden: 18, rumpf: -1 } }] },
      { text: 'Vor dem Sturm herlaufen', aus: [{ p: 50, text: 'Mit gischtendem Bug jagt das Schiff vor dem Wetter her – und ist am Morgen ein gutes Stück weiter, als es sein dürfte.', w: { proviant: 10 } }, { p: 50, text: 'Zu viel Tuch. Mit einem Knall reißt das Großsegel, das Schiff schlägt quer.', w: { stunden: 26, rumpf: -3 } }] },
      { text: 'Dem Navigator das Ruder geben', braucht: { rolle: 'navigator' }, aus: [{ p: 100, text: 'Er findet die Lücke zwischen zwei Gewitterzellen, als hätte er sie bestellt. Das Schlimmste zieht achtern vorbei.', w: { stunden: 4 } }] },
    ] },
  { id: 'fass', titel: 'Treibendes Fass', bild: 'see', gewicht: 9,
    text: 'Ein einzelnes Fass schaukelt in der Dünung, mit Tang bewachsen, aber dicht verspundet.',
    wahl: [
      { text: 'An Bord hieven und öffnen', aus: [
        { p: 35, text: 'Pökelfleisch, noch gut. Der Koch riecht daran, nickt und nimmt es mit in die Kombüse.', w: { proviant: 30 } },
        { p: 30, text: 'Rum! Der Bootsmann lässt es sofort unter Verschluss bringen.', w: { ware: ['rum', 2] } },
        { p: 20, text: 'Im Fass liegt, in Öltuch gewickelt, etwas Schweres.', w: { kurios: 1 } },
        { p: 15, text: 'Faules Wasser. Der Gestank hält sich bis zum Abend.' },
      ] },
      { text: 'Treiben lassen', aus: [{ p: 100, text: 'Das Fass schaukelt achteraus und verschwindet.' }] },
    ] },
  { id: 'nebelbank', titel: 'Nebelbank', bild: 'see', gewicht: 7, klima: [0, 1],
    text: 'Wie eine Wand rollt Nebel heran. Vom Bug aus sieht man das Heck nicht mehr. Irgendwo vor dem Schiff brandet es.',
    wahl: [
      { text: 'Loten und langsam voraus', aus: [{ p: 100, text: 'Faden um Faden tastet sich das Schiff voran, bis der Nebel aufreißt.', w: { stunden: 8 } }] },
      { text: 'Kurs und Fahrt halten', aus: [{ p: 65, text: 'Glück gehabt: Der Nebel lichtet sich, bevor etwas im Weg steht.' }, { p: 35, text: 'Ein Ruck, ein Knirschen – das Schiff schrammt über eine Bank und kommt wieder frei.', w: { rumpf: -2 } }] },
    ] },
  { id: 'delfine', titel: 'Begleiter', bild: 'see', gewicht: 9, klima: [0, 2],
    text: 'Vor dem Bug schießen graue Rücken aus dem Wasser. Delfine – ein Dutzend, zwei Dutzend – reiten auf der Bugwelle.',
    wahl: [
      { text: 'Zusehen', aus: [{ p: 100, text: 'Die ganze Freiwache hängt über der Reling. Für eine Stunde ist niemand an Bord älter als zehn.', w: { tier: 1, ruhm: 3 } }] },
    ] },
  { id: 'ratten', titel: 'Ungebetene Gäste', bild: 'schiff', gewicht: 7,
    text: 'Der Koch kommt aus dem Proviantraum und hält etwas am Schwanz hoch. Es ist nicht die einzige.',
    wahl: [
      { text: 'Fallen stellen und aussortieren', aus: [{ p: 100, text: 'Was angefressen ist, geht über Bord. Es ist mehr, als einem lieb sein kann.', w: { proviant: -24 } }] },
      { text: 'Den Koch machen lassen', braucht: { rolle: 'koch' }, aus: [{ p: 100, text: 'Der Koch verschwindet mit einem Besen und einem Topf nach unten. Was genau er tut, will niemand wissen. Der Schaden bleibt klein.', w: { proviant: -6 } }] },
    ] },
  { id: 'leck', titel: 'Wasser im Schiff', bild: 'schiff', gewicht: 7,
    text: 'In der Bilge steht das Wasser höher als heute Morgen. Irgendwo hat sich eine Naht geöffnet.',
    wahl: [
      { text: 'Pumpen und mit Werg abdichten', aus: [{ p: 60, text: 'Nach ein paar Stunden an der Pumpe hält die Naht wieder – einigermaßen.', w: { stunden: 6, rumpf: -1 } }, { p: 40, text: 'Die Stelle ist schlecht zu erreichen. Es dauert die halbe Nacht.', w: { stunden: 12, rumpf: -2 } }] },
      { text: 'Den Zimmermann holen', braucht: { rolle: 'zimmermann' }, aus: [{ p: 100, text: 'Er horcht am Rumpf wie ein Arzt an der Brust, setzt drei Schläge – und das Wasser fällt.', w: { stunden: 2 } }] },
    ] },
  { id: 'voegel', titel: 'Landvögel', bild: 'see', gewicht: 8,
    text: 'Ein Schwarm kleiner Vögel überholt das Schiff, zielstrebig, alle in dieselbe Richtung. Seevögel sind das nicht.',
    wahl: [
      { text: 'Ihre Richtung peilen', aus: [{ p: 100, text: 'Wo solche Vögel hinfliegen, ist Land. Der Ausguck steigt höher und beschreibt, was er am Horizont ahnt.', w: { aufdecken: 4 } }] },
      { text: 'Nicht beirren lassen', aus: [{ p: 100, text: 'Der Schwarm verschwindet im Dunst.' }] },
    ] },
  { id: 'sternenhimmel', titel: 'Sternklare Nacht', bild: 'see', gewicht: 6,
    text: 'Kein Mond, kein Wölkchen. Der Himmel ist so voller Sterne, dass man meint, sie knistern zu hören.',
    wahl: [
      { text: 'Mit dem Sextanten den Standort bestimmen', braucht: { ausbau: 'sextant' }, aus: [{ p: 100, text: 'Drei Sterne, drei Linien, ein Punkt. Der Standort stimmt auf die Meile – und die Karte der Umgebung gleich mit.', w: { aufdecken: 5, ruhm: 8 } }] },
      { text: 'An Deck liegen und schauen', aus: [{ p: 100, text: 'Der alte Segelmacher erklärt die Sternbilder. Die Hälfte hat er erfunden. Es ist trotzdem schön.', w: { ruhm: 2 } }] },
    ] },
  { id: 'skorbut', titel: 'Müde Knochen', bild: 'schiff', gewicht: 5, abStufe: 2,
    text: 'Drei Mann melden sich krank: Zahnfleisch wund, Beine schwer. Die Alten kennen das. Es fängt immer so an.',
    wahl: [
      { text: 'Rasten und Fisch fangen', aus: [{ p: 100, text: 'Zwei Tage vor Treibanker, frischer Fisch und viel Schlaf. Es wird besser.', w: { stunden: 30, proviant: 12 } }] },
      { text: 'Die Ärztin fragen', braucht: { rolle: 'arzt' }, aus: [{ p: 100, text: 'Sie öffnet ihr Zitronenfass. Nach einer Woche klettern die drei wieder in die Wanten.' }] },
      { text: 'Zähne zusammenbeißen', aus: [{ p: 50, text: 'Es geht – mit halber Kraft und doppelter Laune.', w: { stunden: 10 } }, { p: 50, text: 'Es werden mehr. Das Schiff schleicht nur noch dahin.', w: { stunden: 36 } }] },
    ] },
  { id: 'angelglueck', titel: 'Petri Heil', bild: 'see', gewicht: 9,
    text: 'Die Schleppangel, seit Tagen vergessen, spannt sich plötzlich wie eine Harfensaite.',
    wahl: [
      { text: 'Einholen!', aus: [{ p: 70, text: 'Vier Mann ziehen einen Fisch an Deck, der länger ist als der Schiffsjunge. Heute gibt es keinen Zwieback.', w: { proviant: 22 } }, { p: 30, text: 'Die Leine reißt. Der Bootsmann beschreibt den Fisch später mit ausgebreiteten Armen.' }] },
    ] },
  { id: 'ambra', titel: 'Graues Gold', bild: 'see', gewicht: 4, abStufe: 1,
    text: 'Etwas Graues, Wachsartiges treibt in der Dünung. Der Bootsmann schnuppert und wird ganz still.',
    wahl: [
      { text: 'Vorsichtig bergen', aus: [{ p: 100, text: 'Ambra – Auswurf des Pottwals, von Parfümeuren mit Gold aufgewogen. Der Klumpen wandert in die Kapitänskajüte.', w: { gold: 90 } }] },
    ] },
  { id: 'eisberg', titel: 'Eis voraus', bild: 'eis', gewicht: 12, klima: [1],
    text: 'Ein Berg aus Eis, blau und weiß, höher als die Masten, treibt gemächlich auf Gegenkurs.',
    wahl: [
      { text: 'In weitem Bogen ausweichen', aus: [{ p: 100, text: 'Sicher ist sicher. Unter Wasser ist so ein Berg siebenmal größer als darüber.', w: { stunden: 6 } }] },
      { text: 'Dicht vorbei und zeichnen', aus: [{ p: 60, text: 'Auf einer Stufe des Eisbergs sitzt jemand und sieht herüber.', w: { tier: 2, ruhm: 5 } }, { p: 40, text: 'Unter Wasser ragt ein Sporn weiter heraus, als gedacht.', w: { rumpf: -2 } }] },
    ] },
  { id: 'tanginsel', titel: 'Schwimmender Garten', bild: 'see', gewicht: 12, nurGebiet: [7],
    text: 'Ein Teppich aus goldbraunem Tang, groß wie ein Marktplatz, treibt quer vor dem Bug. Darin krabbelt und zappelt es.',
    wahl: [
      { text: 'Mit dem Kescher durchsuchen', aus: [{ p: 60, text: 'Krabben, kleine Fische, Garnelen – der Koch ist begeistert.', w: { proviant: 16, tier: 1 } }, { p: 40, text: 'Zwischen dem Tang hängt etwas, das nicht hineingehört.', w: { kurios: 1 } }] },
      { text: 'Umfahren', aus: [{ p: 100, text: 'Der Tang schließt sich hinter dem Schiff wie eine Tür.', w: { stunden: 4 } }] },
    ] },
  { id: 'brise', titel: 'Geschenkter Wind', bild: 'see', gewicht: 9,
    text: 'Der Wind dreht einen Strich und frischt auf – genau richtig. Das Schiff legt sich auf die Seite und läuft wie nie.',
    wahl: [
      { text: 'Alles Tuch setzen', aus: [{ p: 100, text: 'Die Logleine läuft aus, dass es raucht. Ein halber Tag ist gewonnen.', w: { proviant: 12 } }] },
    ] },
  { id: 'murren', titel: 'Leere Fässer', bild: 'schiff', gewicht: 20, proviantUnter: 22,
    text: 'Der Koch meldet, was jeder ahnt: Der Zwieback geht zur Neige. Vor dem Mast wird getuschelt.',
    wahl: [
      { text: 'Rum ausgeben', braucht: { ware: 'rum' }, aus: [{ p: 100, text: 'Ein Becher für jeden und ein Trinkspruch auf die Heimkehr. Das Tuscheln hört auf – fürs Erste.', w: { ware: ['rum', -1], ruhm: 3 } }] },
      { text: 'Die Rationen kürzen', aus: [{ p: 100, text: 'Niemand jubelt. Aber es streckt den Vorrat.', w: { proviant: 10 } }] },
      { text: 'Die Angeln auswerfen lassen', aus: [{ p: 55, text: 'Es beißt! Nicht viel, aber genug für eine dünne Suppe mit Aussicht.', w: { stunden: 5, proviant: 16 } }, { p: 45, text: 'Stundenlang nichts. Das Meer ist heute geizig.', w: { stunden: 5 } }] },
    ] },
  { id: 'geisterschiff', titel: 'Segel im Zwielicht', bild: 'sturm', gewicht: 3, abStufe: 3,
    text: 'In der Dämmerung steht ein Schiff am Horizont: volle Segel, kein Licht, kein Laut. Es läuft gegen den Wind.',
    wahl: [
      { text: 'Darauf zuhalten', aus: [{ p: 100, text: 'Je näher man kommt, desto blasser wird es. Als die Sonne untergeht, ist die See leer. Der Ausguck bekreuzigt sich.', w: { stunden: 8, tier: 3, ruhm: 20 } }] },
      { text: 'Abdrehen', aus: [{ p: 100, text: 'Manches will man nicht genauer wissen.' }] },
    ] },
  { id: 'wasserhose', titel: 'Wasserhose', bild: 'sturm', gewicht: 5, klima: [2, 0],
    text: 'Aus einer bleigrauen Wolke senkt sich ein Schlauch zum Meer und beginnt zu wandern – ungefähr hierher.',
    wahl: [
      { text: 'Hart Ruder und weg', aus: [{ p: 80, text: 'Der Wirbel zieht eine Kabellänge achteraus vorbei und hinterlässt Regen aus kleinen Fischen.', w: { proviant: 6 } }, { p: 20, text: 'Der Rand erwischt das Schiff. Zwei Segel sind hin.', w: { rumpf: -2, stunden: 8 } }] },
    ] },
  { id: 'fremdes-segel', titel: 'Der Schatten', bild: 'see', gewicht: 5, abStufe: 2,
    text: 'Seit dem Morgen hält sich achtern ein Segel, immer gleich weit weg. Es zeigt keine Flagge.',
    wahl: [
      { text: 'Nachts den Kurs ändern', aus: [{ p: 100, text: 'Bei Sonnenaufgang ist der Horizont leer. Wer immer das war – er wollte nur schauen. Noch.', w: { stunden: 6 } }] },
      { text: 'Beidrehen und warten', aus: [{ p: 100, text: 'Das fremde Schiff dreht ebenfalls bei. Nach einer Stunde zieht es davon, ohne ein Signal.', w: { stunden: 3, ruhm: 5 } }] },
    ] },
  { id: 'fischer', titel: 'Fremde Fischer', bild: 'insel', gewicht: 8,
    text: 'Zwei schmale Boote mit bunten Segeln kreuzen den Kurs. Die Fischer halten lachend ihren Fang hoch.',
    wahl: [
      { text: 'Tuch gegen Fisch tauschen', braucht: { ware: 'tuch' }, aus: [{ p: 100, text: 'Ein Ballen Tuch gegen einen Berg Fisch und eine Wegbeschreibung, mit Händen und Füßen erzählt.', w: { ware: ['tuch', -1], proviant: 36, geruecht: 1 } }] },
      { text: 'Mit Gold bezahlen (10 Gold)', braucht: { gold: 10 }, aus: [{ p: 100, text: 'Die Münzen werden beäugt, gebissen und für gut befunden.', w: { gold: -10, proviant: 24 } }] },
      { text: 'Freundlich winken', aus: [{ p: 100, text: 'Sie winken zurück und zeigen nach Osten. Dort wohnen sie wohl.' }] },
    ] },
  { id: 'flaschenpost', titel: 'Flaschenpost', bild: 'see', gewicht: 6,
    text: 'Im Kielwasser blinkt etwas: eine verkorkte Flasche, darin ein zusammengerolltes Blatt.',
    wahl: [
      { text: 'Auffischen und lesen', aus: [
        { p: 45, text: '«Wer das findet: Mir geht es gut. Ich bin jetzt Schiffsjunge und habe einen Wal gesehen. Grüßt Mutter. – Fiete, 11 Jahre»', w: { ruhm: 5 } },
        { p: 30, text: 'Eine grobe Skizze mit einem Kreuz und drei Wörtern in ungelenker Schrift.', w: { karte: 1 } },
        { p: 25, text: 'Ein Liebesbrief, vierzig Jahre alt, an eine Anna in Hamburg. Der Kapitän legt ihn zu den Schiffspapieren.', w: { ruhm: 8 } },
      ] },
    ] },
  { id: 'meeresleuchten', titel: 'Kaltes Feuer', bild: 'see', gewicht: 6, klima: [0, 2],
    text: 'Mit der Dunkelheit beginnt das Meer zu leuchten. Jede Welle trägt einen blauen Saum, der Bug pflügt durch flüssiges Licht.',
    wahl: [
      { text: 'Einen Eimer voll an Deck holen', aus: [{ p: 100, text: 'Im Eimer funkelt es wie eingefangene Sterne. Die Mannschaft steht darum wie um ein Lagerfeuer.', w: { tier: 1, ruhm: 4 } }] },
    ] },
  { id: 'seeschlange', titel: 'Drei Buckel', bild: 'see', gewicht: 2, abStufe: 4,
    text: '«Deck! Etwas im Wasser, Steuerbord querab!» Der Ausguck klingt, als traue er seiner eigenen Stimme nicht.',
    wahl: [
      { text: 'Fernrohr!', aus: [{ p: 100, text: 'Drei dunkle Buckel in gleichem Abstand, dann ein vierter. Dann nichts mehr. Alle haben es gesehen. Niemand wird es glauben.', w: { tier: 3, ruhm: 15 } }] },
    ] },
  { id: 'kompass', titel: 'Der Kompass tanzt', bild: 'schiff', gewicht: 5, abStufe: 1,
    text: 'Die Kompassnadel zittert, dreht sich einmal im Kreis und bleibt quer zum Kurs stehen.',
    wahl: [
      { text: 'Nach der Sonne steuern und loten', aus: [{ p: 60, text: 'Unter dem Schiff liegt eine Untiefe aus schwarzem, schwerem Gestein. Der Kartograph trägt sie ein.', w: { stunden: 4, ruhm: 6, aufdecken: 3 } }, { p: 40, text: 'Das Lot bringt etwas herauf, das an einem Klumpen Erz klebt.', w: { stunden: 4, kurios: 1 } }] },
      { text: 'Rasch weiter', aus: [{ p: 100, text: 'Nach einer Meile beruhigt sich die Nadel wieder.' }] },
    ] },
  { id: 'fliegende-fische', titel: 'Es regnet Fisch', bild: 'insel', gewicht: 9, klima: [2],
    text: 'Ein silberner Schwarm schwirrt über die Wellen – und ein gutes Dutzend landet zappelnd an Deck.',
    wahl: [
      { text: 'Einsammeln', aus: [{ p: 100, text: 'Der Koch brät sie, wie sie sind. Besser hat Fisch selten geschmeckt.', w: { proviant: 8, tier: 1 } }] },
    ] },
  { id: 'wrackteile', titel: 'Trümmerfeld', bild: 'see', gewicht: 6, abStufe: 1,
    text: 'Planken, ein Stück Mast, eine halbe Kiste: Hier ist vor Kurzem ein Schiff gesunken.',
    wahl: [
      { text: 'Die Kiste bergen', aus: [{ p: 50, text: 'Durchweicht, aber verschlossen. Drinnen: gemünztes Silber.', w: { gold: 45 } }, { p: 30, text: 'In der Kiste liegt, sorgfältig in Stroh gepackt, ein einzelner Gegenstand.', w: { kurios: 1 } }, { p: 20, text: 'Die Kiste zerfällt beim Anheben. Übrig bleibt eine wasserdichte Kapsel mit einer Karte.', w: { karte: 1 } }] },
      { text: 'Nach Überlebenden suchen', aus: [{ p: 100, text: 'Stundenlang kreuzt das Schiff durch die Trümmer. Niemand. Aber es war richtig, nachzusehen.', w: { stunden: 6, ruhm: 8 } }] },
    ] },
  { id: 'windstille-nacht', titel: 'Lied in der Nacht', bild: 'schiff', gewicht: 6,
    text: 'Auf dem Vordeck spielt jemand Schifferklavier. Einer nach dem anderen stimmt ein, bis das ganze Schiff singt.',
    wahl: [
      { text: 'Mitsingen', aus: [{ p: 100, text: 'Der Kapitän singt falsch, aber laut. Das merkt sich die Mannschaft – im Guten.', w: { ruhm: 3 } }] },
      { text: 'Die Wache nicht ablenken', aus: [{ p: 100, text: 'Das Lied geht auch ohne Kapitän weiter. Leiser.' }] },
    ] },
]
