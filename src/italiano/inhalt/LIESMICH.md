# Parla Italiano – Lerninhalte schreiben

Der Kurs führt in 24 Leveln (je 5 Lerntage) von null bis zum Einstieg in B1. Jedes Level ist eine Datei `level-NN.json` in diesem Ordner. Die Übungen und Tests erzeugt das Tool aus diesen Daten.

- Aufbau der Datei: `../kern/inhaltTypen.ts` (jedes Feld ist dort erklärt)
- Vorbild in Ton, Länge und Qualität: `level-01.json`
- Prüfung: `node scripts/italiano-pruefe.mjs <Level>` – muss **0 Fehler** melden; Hinweise ansehen und beheben, wenn sie berechtigt sind
- Schon vergebene Wörter früherer Level: `node scripts/italiano-pruefe.mjs --bekannt <Level>`
- Was in der Geschichte schon feststeht (Namen, Schauplätze, offene Fragen): `node scripts/italiano-pruefe.mjs --geschichte <Level>`

## Erfahrungen aus Level 1–8 (bitte beachten)

- **Wort schon vergeben?** Dann ein anderes Wort aus demselben Wortfeld nehmen. Die Wörter im Lehrplan sind Beispiele.
- **Namen und Tatsachen der Geschichte nicht doppelt vergeben und nicht widersprechen.** Vor dem Schreiben `--geschichte` ansehen. Fest steht unter anderem: Die Reise beginnt im Juni (Bolzano: 20./21. Juni). Ben arbeitet in einem Büro in Hamburg. Marco ist Fotograf mit eigenem Studio.
- **Sofia** tritt bis Level 12 nur als «Frau mit rotem Schal» auf und spricht nicht (kein Sprecher `sofia`). Ab Level 13 hat sie einen Namen und spricht.
- **Grammatik-Übungen sind italienische Sätze.** Deutscher Text im Satz ist nur bei den Aussprache-Tagen in Level 1 vorgesehen.
- **Lücke am Apostroph:** Würde die Lösung auf einen Apostroph enden («un'», «l'», «dell'»), gehört das folgende Wort mit in die Lücke («un'amica»), damit kein Leerzeichen nach dem Apostroph entsteht.
- **Eindeutigkeit:** Ist eine falsche Möglichkeit nur «unüblich» oder nur im Zusammenhang falsch, muss der Satz den Zusammenhang selbst liefern – oder die Möglichkeit wird ersetzt.
- **«Lo sapevi?»:** Jahreszahlen, Längen und Rekorde nur nennen, wenn du sicher bist. Sonst ohne Zahl formulieren.
- Für den Satzbau braucht jeder Dialog mindestens drei Zeilen mit 3 bis 9 Wörtern.

## Für wen

Deutschsprachige Erwachsene, die in der Pause 15 Minuten lernen. Erklärungen auf Deutsch, in der Du-Form, freundlich und knapp. Büro-tauglich: keine Politik, keine Religion als Streitthema, nichts Anzügliches, keine echten Personen oder Marken.

## Regeln für jedes Feld

**Allgemein**
- Italienisch: korrektes, natürliches Standard-Italienisch, wie man es heute spricht. Im Zweifel die üblichere Form (z. B. «trent'anni», «Che cos'è?»).
- Deutsch: natürliche Übersetzung, kein Wort-für-Wort-Deutsch.
- Nur das gerade Apostroph `'`. Italienische Zitate in « ». Kein Leerzeichen nach dem Apostroph (`l'amico`).
- Akzente richtig setzen: è/é, à, ì, ò, ù (perché, caffè, città, così, più).

**woerter (genau 12 je Tag)**
- Das Wortfeld des Tages aus dem Lehrplan unten. Jedes Wort kommt im ganzen Kurs nur einmal als neues Wort vor.
- Nomen (`art: "n"`) immer mit bestimmtem Artikel: «il treno», «lo zaino», «l'amico», «la stazione». Deutsch ebenfalls mit Artikel.
- Verben (`"v"`) in der Grundform, Adjektive (`"a"`) männlich Einzahl, feste Wendungen als `"p"`, alles andere `"x"`.
- `aus`: das Wort in Silben mit Bindestrich, betonte Silbe in Großbuchstaben, sonst genau die Buchstaben von `it` (ohne Satzzeichen): «la sta-ZIO-ne», «per fa-VO-re», «l'a-MI-co».
- `bsp`: kurzer, alltagsnaher Satz mit diesem Wort (höchstens 80 Zeichen), nur mit Grammatik, die bis zu diesem Tag dran war.
- `emoji`: ein passendes Emoji, wenn es eines gibt.
- `hinweis`: nur wenn er wirklich hilft (unregelmäßiger Plural, falscher Freund, weibliche Form, Aussprache-Falle).

**grammatik**
- Genau das Thema aus dem Lehrplan, nicht mehr. `erklaerung` höchstens 800 Zeichen, mit einem Merksatz oder einer typischen Falle für Deutsche. `**fett**` und Zeilenumbrüche sind erlaubt.
- `tabelle` nur, wenn sie hilft (Konjugation, Formen), höchstens 4 Spalten und 9 Zeilen.
- `beispiele`: 3 kurze Sätze.
- `uebungen`: genau 8 Sätze mit je einer Lücke `___`, einer Lösung und 3 falschen Möglichkeiten. Die falschen müssen **eindeutig falsch** sein (keine zweite mögliche Lösung!) und trotzdem plausibel wirken. Schwierigkeit steigt von 1 bis 8. `warum` bei den kniffligen.

**dialog** – zugleich die Folge der Fortsetzungsgeschichte
- 6 bis 10 Zeilen, jede höchstens 125 Zeichen. Nutzt Wörter und Grammatik des Tages, sonst möglichst Bekanntes aus früheren Tagen. Einzelne neue Wörter sind in Ordnung – zu jeder Zeile gibt es die Übersetzung.
- Sprecher (`wer`): `ben`, `giulia`, `nonna`, `marco`, `sofia`, `luca`. Für alle anderen `uomo` oder `donna` mit `als` («Barista», «Signora», «Controllore»).
- Jede Folge bringt die Geschichte ein Stück voran und endet offen. `folge` ist die offene Frage dazu, auf Deutsch.
- `fragen`: 3 Verständnisfragen mit 1 richtigen und 3 falschen Antworten. Level 1–16 auf Deutsch, ab Level 17 auf Italienisch (Frage und Antworten).
- `rollenspiel`: 3 Alltagslagen (auf Deutsch), in denen der Lernende selbst etwas sagen muss – mit dem Stoff des Tages. 1 passende und 3 unpassende italienische Antworten. Die unpassenden sind entweder inhaltlich fehl am Platz oder enthalten genau den Fehler, den das Grammatikthema des Tages vermeiden soll.

**wissen** – «Lo sapevi?»
- Etwas Überraschendes über Italien, das zum Tag oder zur Stadt passt: Alltag, Essen, Gesten, Sprache, Geschichte. Höchstens 430 Zeichen.
- Nur gesicherte Tatsachen. Nichts erfinden, keine Zahlen raten.

**pruefung.lesetext**
- Ein zusammenhängender Text (350–950 Zeichen), der den Stoff des Levels mischt, nur mit bekannter Grammatik. 4 Fragen dazu (Sprache wie bei `fragen`).

## Die Geschichte: «Il quaderno di Nonna Rosa»

**Worum es geht:** Nonna Rosa hat vor sechzig Jahren 24 Seiten aus ihrem Rezeptheft herausgetrennt und an Freunde in ganz Italien verschenkt – «damit das Rezept auf Reisen geht». Ihre Enkelin Giulia will das Heft wieder vollständig machen. Ben, ein Deutscher, der gerade Italienisch lernt, hilft ihr. In jeder Stadt taucht eine Seite auf; wer sie haben will, muss zeigen, dass er Italienisch kann (das ist die Prüfung am Ende jedes Levels). Die Reise endet in Cagliari am Tisch von Nonna Rosa.

**Figuren**
- **Ben** (`ben`): Anfang 30, aus Hamburg. Neugierig, höflich, trockener Humor. Sein Italienisch ist immer korrekt, aber so einfach, wie es zum Level passt. Er fragt nach, wenn er etwas nicht versteht.
- **Giulia** (`giulia`): 30, Köchin aus Turin. Herzlich, schnell, ungeduldig, isst für ihr Leben gern.
- **Nonna Rosa** (`nonna`): 84, lebt in Cagliari. Meldet sich am Telefon, gibt Rätsel auf, weiß mehr, als sie sagt.
- **Marco** (`marco`): Giulias Cousin, Fotograf. Fährt eine alte, cremefarbene Cinquecento. Immer hungrig, nie pünktlich. Stößt in Level 3 dazu.
- **Sofia** (`sofia`): Frau mit rotem Schal, taucht ab Level 4 immer wieder auf. In Level 13 stellt sich heraus: Journalistin, die ein Buch über Nonna Rosa schreibt. Ab Level 20 Verbündete.
- **Luca** (`luca`): Restaurantbesitzer aus Mailand, will das Rezept für seine Kette. Charmant, oft einen Schritt voraus. Erster Auftritt in Level 2. Am Ende zeigt sich: Er war Nonna Rosas Lehrling.
- Alle anderen: `uomo` / `donna` mit `als`.

**Was in welchem Level geschieht** (Tag 5 endet immer damit, dass die Seite greifbar ist – der Besitzer verlangt einen Beweis, dass Ben Italienisch kann)

| Level | Ort | Handlung |
|---|---|---|
| 1 | Torino | Ben lernt Giulia im Café kennen. Das Heft, die 24 fehlenden Seiten. Seite 1 hat der Barista Piero. |
| 2 | Milano | Mit dem Zug nach Mailand. Luca taucht auf und will das Heft kaufen. Seite 2 bei einer Bäckerin. |
| 3 | Lago di Como | Bei Marcos Familie am See. Marco schließt sich mit seiner Cinquecento an. Seite 3 im Familienalbum der Tante. |
| 4 | Genova | Suche in den engen Gassen. Eine Frau mit rotem Schal beobachtet sie. Seite 4 bei einem Fischer am Hafen. |
| 5 | Verona | Alltag in der Pension. Signor Bruno empfängt nur Punkt acht Uhr – und Marco verschläft. Seite 5. |
| 6 | Bolzano | Wetterumschwung in den Dolomiten, falsche Kleidung, Rettung in einer Berghütte. Seite 6 bei der Hüttenwirtin. |
| 7 | Venezia | Einkauf am Rialto-Markt. Luca lädt zum Essen ein – eine Falle? Seite 7 in einer Osteria. |
| 8 | Bologna | Kochkurs und Tortellini-Wettbewerb; der Preis ist Seite 8. |
| 9 | Firenze | Das Heft ist weg! Was ist gestern passiert? Es taucht im Fundbüro eines Museums auf. Seite 9. |
| 10 | Pisa | Bahnstreik, verpasster Zug. Jemand hat ihnen heimlich geholfen. Seite 10. |
| 11 | Siena | Ferienwohnung während des Palio. Die Seite steckt hinter einem Bild. Seite 11. |
| 12 | Perugia | Marco hat zu viel Schokolade gegessen. Apotheke, Ärztin – sie ist die Enkelin einer Freundin von Nonna Rosa. Seite 12. |
| 13 | Roma | Nonna Rosa erzählt am Telefon von früher. Sofia gibt sich als Journalistin zu erkennen. Seite 13. |
| 14 | Napoli | Kochen bei Signora Carmela. Eine Seite verschwindet – war es Luca? Seite 14. |
| 15 | Amalfi | Pläne für die Zukunft, Hotel, Bootstour. Eine Wette mit Luca. Seite 15. |
| 16 | Bari | Die Nudelfrauen der Altstadt, Handeln auf dem Markt. Seite 16. |
| 17 | Matera | Ben bekommt ein Jobangebot in Italien. Bleibt er? Seite 17 in einer Höhlenwohnung. |
| 18 | Lecce | Eingeladen auf einer Hochzeit. Seite 18 hat der Brautvater. |
| 19 | Tropea | Die Cinquecento bleibt liegen. Werkstatt, Warten am Meer. Seite 19 beim Mechaniker. |
| 20 | Reggio Calabria | Luca behauptet im Fernsehen, das Rezept zu besitzen. Sofia schlägt sich auf Giulias Seite. Seite 20. |
| 21 | Taormina | Streit: Darf man ein Familiengeheimnis veröffentlichen? Seite 21 am Ätna. |
| 22 | Siracusa | Nonna Rosas Geschichte: warum sie die Seiten einst verschenkte. Seite 22. |
| 23 | Palermo | Luca bittet um Verzeihung. Was wäre gewesen, wenn …? Seite 23. |
| 24 | Cagliari | Ankunft bei Nonna Rosa. Die letzte Seite hat sie selbst. Alle sitzen an einem Tisch. |

## Lehrplan: 120 Lerntage

Je Zeile: **Tag · Titel** — Wortfeld (Beispiele, nicht abschließend) — **Grammatik**.
Was in früheren Tagen stand, gilt als bekannt. Was erst später kommt, im Text vermeiden (im Dialog höchstens als fester Ausdruck).

### Abschnitt 1 · Ankommen (A1.1)

**Level 1 – Torino** (fertig, siehe `level-01.json`)
- 1 · Ciao! Begrüßen und verabschieden — Grüße, Höflichkeit — **Aussprache c und g**
- 2 · Wie heißt du? — vorstellen, Herkunft — **essere Einzahl, io/tu/lui/lei**
- 3 · Wie geht's? — Befinden — **essere Mehrzahl, Verneinung mit non**
- 4 · Zahlen und Alter — 0–10, l'anno — **avere, Alter**
- 5 · Im Café: Was ist das? — erste Dinge, dove/che cosa/chi — **Aussprache gn, gli, sc, Doppelkonsonanten**

**Level 2 – Milano**
- 6 · Am Bahnhof — il treno, la stazione, il biglietto, il binario, lo zaino, la valigia … — **unbestimmter Artikel un, uno, una, un'**
- 7 · Im Café bestellen — il cappuccino, il cornetto, il panino, il succo, il tè, lo zucchero, il latte … — **bestimmter Artikel Einzahl il, lo, la, l'**
- 8 · Bezahlen — Zahlen 11–100 (die wichtigsten als Wörter, der Rest in der Tabelle), l'euro, quanto costa?, il conto, caro … — **Mehrzahl der Nomen (-o → -i, -a → -e, -e → -i)**
- 9 · In der Stadt — la città, la strada, la piazza, il negozio, la banca, il duomo, il panificio … — **bestimmter Artikel Mehrzahl i, gli, le**
- 10 · Jemand will das Heft — vorrei, posso?, certo, mi dispiace, subito, ancora, basta, il prezzo … — **avere in Wendungen (avere fame, sete, fretta, ragione, paura)**

**Level 3 – Lago di Como**
- 11 · Die Familie — la madre, il padre, il fratello, la sorella, il figlio, la zia, il cugino … — **Possessiva (il mio, la tua …; ohne Artikel bei Verwandten in der Einzahl)**
- 12 · Leute beschreiben — alto, basso, giovane, vecchio, bello, biondo, i capelli, gli occhi … — **Adjektive auf -o/-a: Angleichung in Zahl und Geschlecht**
- 13 · Charakter — simpatico, gentile, divertente, timido, serio, intelligente, pigro … — **Adjektive auf -e; molto, poco, troppo**
- 14 · Berufe — il cuoco, il fotografo, il medico, l'insegnante, lavorare, l'ufficio, lo studente … — **Verben auf -are (Präsens)**
- 15 · Das Familienalbum — Farben, la foto, l'album, il lago, la barca, la villa, guardare … — **Fragen stellen: perché, quando, come, quale; Satzmelodie**

**Level 4 – Genova**
- 16 · Wo ist …? — il porto, il mercato, la chiesa, il museo, la farmacia, il ponte, l'ospedale … — **c'è / ci sono**
- 17 · Der Weg — a destra, a sinistra, dritto, vicino, lontano, l'angolo, girare, attraversare … — **Präpositionen a und in bei Stadt und Land**
- 18 · Unterwegs in der Stadt — l'autobus, la metro, la macchina, la bicicletta, a piedi, la fermata, prendere … — **andare (Präsens); in macchina, a piedi**
- 19 · In den Gassen — la via, il numero, la porta, il palazzo, il piano, la scala, cercare, trovare … — **Ortsangaben: davanti a, dietro, accanto a, tra, sopra, sotto**
- 20 · Am Hafen — il mare, la nave, il pesce, il pescatore, il vento, aspettare, pescare … — **questo und quello (Grundformen); Wiederholung der Fragewörter**

### Abschnitt 2 · Alltag (A1.2)

**Level 5 – Verona**
- 21 · Wie spät ist es? — l'ora, mezzogiorno, mezzanotte, un quarto, mezza, presto, tardi, l'orologio … — **Uhrzeit: è l'una, sono le …; a che ora?**
- 22 · Mein Tag — la colazione, il pranzo, la cena, la mattina, il pomeriggio, la sera, leggere, scrivere … — **Verben auf -ere (Präsens)**
- 23 · Morgens — svegliarsi, alzarsi, lavarsi, vestirsi, riposarsi, la doccia, lo spazzolino … — **reflexive Verben (Präsens)**
- 24 · Die Woche — die Wochentage, domani, la settimana, il fine settimana, sempre, spesso, dormire, partire … — **Verben auf -ire, auch mit -isc- (capire, finire, preferire)**
- 25 · Ein Termin um acht — l'appuntamento, puntuale, in ritardo, in anticipo, arrivare, la sveglia, mai … — **Häufigkeit und doppelte Verneinung (non … mai)**

**Level 6 – Bolzano**
- 26 · Das Wetter — piove, nevica, fa caldo, fa freddo, la nuvola, il temporale, la pioggia, il cielo … — **fare (Präsens) und Wetterausdrücke**
- 27 · Monate und Jahreszeiten — die Monate (die wichtigsten als Wörter, der Rest in der Tabelle), la primavera, l'estate, l'autunno, l'inverno, il compleanno … — **Datum; a/in bei Monaten und Jahreszeiten**
- 28 · Kleidung — la giacca, il maglione, le scarpe, i pantaloni, il cappello, la sciarpa, i guanti, portare … — **questo und quello: alle Formen**
- 29 · In den Bergen — la montagna, il sentiero, il rifugio, la neve, salire, scendere, camminare, la cima … — **venire und uscire; andare oder venire?**
- 30 · In der Hütte — la zuppa, il fuoco, la coperta, bagnato, asciutto, avere bisogno di, avere voglia di … — **stare und dare (Präsens)**

**Level 7 – Venezia**
- 31 · Auf dem Markt — la mela, il pomodoro, l'insalata, la cipolla, l'aglio, il limone, la frutta, la verdura … — **mi piace / mi piacciono**
- 32 · Mengen — un chilo, un etto, un litro, la bottiglia, il pezzo, mezzo, abbastanza, il sacchetto … — **Teilungsartikel (del, dello, della, dei …) und Mengen mit di**
- 33 · Im Restaurant — il menù, l'antipasto, il primo, il secondo, il contorno, il dolce, il cameriere, ordinare … — **volere (Präsens) und höfliches vorrei**
- 34 · Schmeckt es? — buono, delizioso, salato, dolce, piccante, fresco, crudo, cotto … — **piacere mit Person (a me, a te, a Giulia); anche a me, neanche a me**
- 35 · Die Einladung — il piatto, il bicchiere, la forchetta, il coltello, il cucchiaio, il tovagliolo, brindare … — **bere (Präsens); non … niente, non … nessuno**

**Level 8 – Bologna**
- 36 · Hast du Zeit? — libero, occupato, insieme, l'invito, stasera, più tardi, d'accordo, incontrare … — **potere (Präsens)**
- 37 · Ich muss … — comprare, pulire, studiare, preparare, la spesa, il compito, pagare … — **dovere (Präsens)**
- 38 · Hobbys — lo sport, il calcio, nuotare, ballare, cantare, suonare, il cinema, il libro … — **sapere oder potere? giocare oder suonare?**
- 39 · Im Kochkurs — la pentola, la padella, tagliare, mescolare, l'olio, il sale, la farina, l'uovo … — **Präposition + Artikel (al, alla, nel, sul, dal, del …)**
- 40 · Der Wettbewerb — vincere, perdere, il premio, la gara, bravo, provare, il giudice … — **Ordnungszahlen; Modalverben im Überblick**

### Abschnitt 3 · Erzählen (A2.1)

**Level 9 – Firenze**
- 41 · Gestern — ieri, stamattina, la settimana scorsa, fa, già, non ancora, appena, ieri sera … — **passato prossimo mit avere (regelmäßig)**
- 42 · Das Heft ist weg! — dimenticare, lasciare, la borsa, le chiavi, il portafoglio, rubare, sparire … — **unregelmäßige Partizipien I (fatto, detto, visto, preso, messo, perso)**
- 43 · Im Museum — il quadro, la statua, l'artista, la mostra, la guida, famoso, il capolavoro … — **passato prossimo: Verneinung, Stellung von già, mai, ancora**
- 44 · Im Fundbüro — descrivere, il modulo, di pelle, quadrato, rotondo, l'oggetto, riconoscere … — **unregelmäßige Partizipien II (scritto, letto, aperto, chiuso, chiesto, risposto)**
- 45 · Ein Abend am Arno — il tramonto, passeggiare, la gelateria, il gusto, festeggiare, il fiume … — **Zeitangaben mit da, per, fa**

**Level 10 – Pisa**
- 46 · Wohin bist du gefahren? — tornare, entrare, restare, il viaggio, la partenza, l'arrivo, il ritorno … — **passato prossimo mit essere (Angleichung)**
- 47 · Streik! — lo sciopero, il ritardo, cancellato, la coincidenza, il controllore, l'annuncio … — **essere oder avere? Wahl des Hilfsverbs**
- 48 · Fahrkarten kaufen — andata e ritorno, la classe, il posto, prenotare, la biglietteria, convalidare … — **reflexive Verben im passato prossimo**
- 49 · Im Zug — il finestrino, il corridoio, il vagone, cambiare, il passeggero, il sedile … — **Präpositionen beim Reisen (da … a, per, con, in)**
- 50 · Der schiefe Turm — prima, poi, dopo, alla fine, improvvisamente, la torre, pendente, il turista … — **der Reihe nach erzählen; nascere, succedere**

**Level 11 – Siena**
- 51 · Die Wohnung — l'appartamento, la cucina, il bagno, la camera, il soggiorno, il balcone, affittare … — **direkte Objektpronomen lo, la**
- 52 · Möbel — il letto, l'armadio, il divano, la lampada, lo specchio, il frigorifero, la lavatrice … — **direkte Objektpronomen li, le, mi, ti, ci, vi**
- 53 · Wo sind die Schlüssel? — mettere, spostare, da qualche parte, dappertutto, il cassetto, lo scaffale … — **Pronomen im passato prossimo (l'ho visto, li ho presi)**
- 54 · Beim Palio — la festa, la corsa, il cavallo, la bandiera, la folla, emozionante, il quartiere … — **conoscere oder sapere? ecco + Pronomen (eccolo)**
- 55 · Hinter dem Bild — il muro, appendere, nascosto, la busta, scoprire, il chiodo, la cornice … — **Pronomen: Wiederholung in Präsens und Vergangenheit**

**Level 12 – Perugia**
- 56 · Der Körper — la testa, la pancia, la mano, il piede, la schiena, il dente, la gola, l'occhio … — **unregelmäßige Mehrzahl (le mani, le braccia, gli uomini, le uova)**
- 57 · Mir tut etwas weh — mi fa male, la febbre, il raffreddore, la tosse, guarire, il dolore … — **indirekte Objektpronomen (mi, ti, gli, le, ci, vi, gli)**
- 58 · In der Apotheke — la medicina, la pastiglia, lo sciroppo, la crema, consigliare, la ricetta medica … — **indirekte Pronomen mit dare, dire, chiedere, consigliare**
- 59 · Bei der Ärztin — la visita, respirare, grave, la cura, la pressione, il paziente, tossire … — **Imperativ (tu, noi, voi)**
- 60 · Gute Besserung — sano, malato, meglio, peggio, attento, il riposo, la salute … — **verneinter Imperativ; Imperativ mit Pronomen (prendilo)**

### Abschnitt 4 · Früher und später (A2.2)

**Level 13 – Roma**
- 61 · Als ich klein war — da bambino, il gioco, il cortile, ricordare, l'infanzia, crescere … — **imperfetto (regelmäßig)**
- 62 · Rom damals — una volta, a quel tempo, la fontana, la bottega, povero, ricco, il quartiere popolare … — **imperfetto von essere, fare, dire, bere**
- 63 · Gewohnheiten — di solito, ogni giorno, d'estate, la vacanza, la spiaggia, il gelato, raccontare … — **imperfetto für Gewohnheiten und Beschreibungen**
- 64 · Alte Steine — il monumento, le rovine, antico, moderno, l'imperatore, il secolo, la storia … — **Jahreszahlen und Jahrhunderte; c'era, c'erano**
- 65 · Sofias Geheimnis — la giornalista, l'intervista, la verità, la bugia, fidarsi, credere, il sospetto … — **mentre + imperfetto**

**Level 14 – Napoli**
- 66 · In Carmelas Küche — impastare, il forno, la mozzarella, il basilico, il lievito, sfornare, la pasta (Teig) … — **imperfetto oder passato prossimo? Hintergrund und Ereignis**
- 67 · Was ist passiert? — all'improvviso, cadere, rompere, bruciare, gridare, il rumore, spaventarsi … — **mentre …, quando …: beide Zeiten in einem Satz**
- 68 · Das Rezept — gli ingredienti, aggiungere, un pizzico, bollire, friggere, assaggiare, la dose … — **ne (ne prendo due, ne voglio un po')**
- 69 · Auf der Straße — il traffico, il motorino, il vicolo, rumoroso, vivace, la bancarella, il clacson … — **ci als Ortsangabe (ci vado, ci sono stato)**
- 70 · Die verschwundene Seite — il ladro, la polizia, denunciare, scappare, la colpa, innocente, il testimone … — **Modalverben im passato prossimo**

**Level 15 – Amalfi**
- 71 · Pläne — il progetto, il futuro, l'anno prossimo, decidere, sperare, sognare, tra un mese … — **futuro semplice (regelmäßig)**
- 72 · Im Hotel — la camera doppia, la prenotazione, la reception, il bagaglio, la vista, incluso … — **futuro unregelmäßig (sarò, avrò, andrò, farò, verrò, potrò)**
- 73 · Am Strand — l'ombrellone, il costume, abbronzarsi, la crema solare, l'onda, la sabbia … — **futuro für Vermutungen; se + futuro**
- 74 · Die Bootstour — il capitano, la costa, la grotta, remare, il salvagente, a bordo, l'isola … — **stare per + Infinitiv; tra, fra, entro**
- 75 · Die Wette — scommettere, la sfida, promettere, mantenere, sicuro, impossibile, la scommessa … — **alle Zeiten im Zusammenhang (Wiederholung)**

**Level 16 – Bari**
- 76 · Kleidung kaufen — la taglia, il camerino, stretto, largo, il saldo, lo sconto, la commessa … — **Komparativ (più … di, meno … di, più … che)**
- 77 · Besser und am besten — migliore, peggiore, maggiore, minore, ottimo, pessimo, il massimo … — **Superlativ (il più …, -issimo) und unregelmäßige Formen**
- 78 · Handeln auf dem Markt — trattare, conveniente, la qualità, fatto a mano, l'offerta, il cliente, l'affare … — **Gleichheit: (tanto) … quanto, (così) … come**
- 79 · Pasta von Hand — le orecchiette, l'impasto, la semola, il mattarello, la tradizione, stendere … — **unpersönliches si (si fa, si mangia, si dice)**
- 80 · Zwischenbilanz — finora, la metà, l'avventura, mancare, indimenticabile, il ricordo, la tappa … — **ci und ne im Überblick (Wiederholung A2)**

### Abschnitt 5 · Wünsche und Meinung (B1.1)

**Level 17 – Matera**
- 81 · Ich würde gern … — mi piacerebbe, volentieri, magari, il desiderio, il sogno, realizzare … — **condizionale presente (regelmäßig)**
- 82 · Das Jobangebot — il colloquio, lo stipendio, il contratto, l'azienda, il collega, assumere, l'esperienza … — **condizionale unregelmäßig (sarei, avrei, potrei, dovrei, verrei)**
- 83 · Höflich bitten — gentilmente, la richiesta, il favore, disturbare, permettere, la cortesia … — **condizionale für Bitten und Ratschläge (potrebbe …?, dovresti …)**
- 84 · Die Höhlenstadt — il sasso, scavare, la roccia, il panorama, abbandonato, restaurare, l'abitante … — **Indefinita (qualcuno, qualcosa, nessuno, ogni, alcuni, ciascuno)**
- 85 · Bleiben oder gehen? — la scelta, il dubbio, rinunciare, accettare, rifiutare, il vantaggio, lo svantaggio … — **Sätze verbinden: siccome, quindi, però, invece, anche se**

**Level 18 – Lecce**
- 86 · Die Einladung — il matrimonio, gli sposi, l'invitato, il regalo, la cerimonia, gli auguri, l'anello … — **Relativpronomen che**
- 87 · Leute, die ich kenne — l'amicizia, il vicino, il conoscente, il fidanzato, innamorarsi, litigare, fare pace … — **Relativpronomen cui (con cui, di cui, a cui, in cui)**
- 88 · Das Fest — il brindisi, la torta, la musica dal vivo, il discorso, commuoversi, il ricevimento … — **chi (wer …) und quello che**
- 89 · Barock und Gold — la facciata, la pietra, dorato, decorato, elegante, il dettaglio, il centro storico … — **Adverbien auf -mente**
- 90 · Der Brautvater — orgoglioso, emozionato, ringraziare, consegnare, custodire, la commozione … — **stare + gerundio (sto parlando)**

**Level 19 – Tropea**
- 91 · Die Panne — il guasto, il motore, la gomma, la benzina, il meccanico, l'officina, riparare … — **Imperativ der Höflichkeitsform (Lei)**
- 92 · In der Werkstatt — il pezzo di ricambio, controllare, il freno, la batteria, il preventivo, funzionare … — **Imperativ mit Pronomen (lo prenda, non lo faccia, dimmi)**
- 93 · Höflich nach dem Weg fragen — l'incrocio, il semaforo, la rotonda, l'uscita, l'autostrada, proseguire … — **doppelte Pronomen I (me lo, te la, ce li)**
- 94 · Warten am Meer — la scogliera, annoiarsi, rilassarsi, nel frattempo, la pazienza, il panorama … — **doppelte Pronomen II (glielo, gliela, gliene)**
- 95 · Der Mechaniker — onesto, la sorpresa, regalare, restituire, il debito, la gratitudine, la fattura … — **Pronomen und Imperativ (Wiederholung)**

**Level 20 – Reggio Calabria**
- 96 · Die Nachrichten — il telegiornale, la notizia, l'articolo, in diretta, il canale, trasmettere … — **indirekte Rede in der Gegenwart (dice che …, chiede se …)**
- 97 · Am Handy — il messaggio, la chiamata, lo schermo, la rete, scaricare, condividere, la batteria scarica … — **Sätze verknüpfen: perciò, infatti, cioè, comunque, tuttavia**
- 98 · Lucas Auftritt — affermare, mentire, la prova, dimostrare, smentire, il pubblico, la fama … — **Infinitivsätze: prima di, dopo aver/essere, senza**
- 99 · Die Fähre — il traghetto, lo stretto, imbarcarsi, il ponte (Deck), sbarcare, il molo … — **Verben mit Präposition (cominciare a, finire di, cercare di, riuscire a)**
- 100 · Verbündete — l'alleato, collaborare, il piano, la strategia, convincere, la fiducia … — **Wiederholung B1.1: condizionale, Relativsätze, Pronomen**

### Abschnitt 6 · Mitreden (B1.2)

**Level 21 – Taormina**
- 101 · Was denkst du? — secondo me, l'opinione, il parere, essere d'accordo, avere torto, discutere … — **congiuntivo presente (regelmäßig) nach penso che, credo che**
- 102 · Der Vulkan — il vulcano, l'eruzione, la lava, il cratere, il terremoto, pericoloso … — **congiuntivo unregelmäßig (sia, abbia, vada, faccia, possa)**
- 103 · Umwelt — l'ambiente, l'inquinamento, riciclare, la plastica, l'energia, risparmiare, proteggere … — **congiuntivo nach unpersönlichen Ausdrücken (è importante che, bisogna che)**
- 104 · Veröffentlichen? — pubblicare, il diritto, il rispetto, tradire, la riservatezza, l'editore … — **congiuntivo nach Wunsch, Hoffnung, Angst (spero che, voglio che, ho paura che)**
- 105 · Die Abstimmung — votare, la maggioranza, a favore, contro, convincente, il compromesso … — **Indikativ oder congiuntivo? (so che / penso che)**

**Level 22 – Siracusa**
- 106 · Nonnas Geschichte — da giovane, emigrare, la nostalgia, il coraggio, la povertà, ricominciare … — **trapassato prossimo**
- 107 · Warum sie die Seiten verschenkte — la promessa, il dono, separarsi, la lontananza, mantenere i contatti … — **Vorzeitigkeit erzählen (quando sono arrivato, era già partito)**
- 108 · Das antike Theater — lo spettacolo, la tragedia, l'attore, il palcoscenico, applaudire, il pubblico (Wort ist vergeben – anderes wählen) … — **passato remoto erkennen (fu, andò, disse) – nur lesen**
- 109 · Briefe — la calligrafia, cordiali saluti, con affetto, il francobollo, spedire, il destinatario … — **congiuntivo imperfetto nach volevo che, pensavo che**
- 110 · Was wirklich geschah — in realtà, a dire il vero, confessare, il malinteso, chiarire, perdonare … — **Zeitenfolge beim Erzählen (Wiederholung)**

**Level 23 – Palermo**
- 111 · Wenn ich du wäre — al tuo posto, immaginare, il caso, la fortuna, il rischio, l'ipotesi … — **Bedingungssatz: se + congiuntivo imperfetto + condizionale**
- 112 · Auf dem Markt — urlare, l'arancina, il pesce spada, speziato, affollato, l'odore, la spezia … — **se + Präsens/Futur oder se + congiuntivo? (wirklich oder gedacht)**
- 113 · Lucas Entschuldigung — chiedere scusa, pentirsi, lo sbaglio, l'orgoglio, meritare, la possibilità … — **Passiv mit essere und venire**
- 114 · Kultur — il mosaico, la cattedrale, arabo, normanno, il patrimonio, l'influenza, conservare … — **si passivante (si vendono, si parla)**
- 115 · Fast am Ziel — quasi, finalmente, il traguardo, mancare poco, superare, la meta … — **congiuntivo und Bedingungssätze (Wiederholung)**

**Level 24 – Cagliari**
- 116 · Am Telefon — pronto, richiamare, la linea, la segreteria, lasciare un messaggio, il prefisso … — **indirekte Rede in der Vergangenheit (ha detto che …)**
- 117 · Ein Problem lösen — il reclamo, il rimborso, sostituire, il difetto, lamentarsi, la soluzione, risolvere … — **argumentieren: da un lato, dall'altro, inoltre, insomma; höflich widersprechen**
- 118 · Redewendungen — in bocca al lupo, acqua in bocca, non vedo l'ora, meno male, essere al verde, avere le mani in pasta … — **gerundio (facendo, andando) und feste Wendungen**
- 119 · Bei Nonna Rosa — accogliere, abbracciare, apparecchiare, servire, il profumo, la tavola … — **die ganze Reise erzählen: alle Vergangenheitszeiten**
- 120 · Alla fine: das Rezept — il segreto, l'ingrediente, la pazienza, tramandare, l'eredità, per sempre … — **großer Rückblick: die wichtigsten Themen des Kurses gemischt**
