# Der Coach – Regeln für Inhalte und Muster

> **Stand 25.11.2026:** Entscheidungen und Korrekturen in [08_ENTSCHEIDUNGEN.md](08_ENTSCHEIDUNGEN.md) gehen dieser Datei vor (u. a. alle 14 Bereiche in Stufe 1, Bereichsseiten, rund 60 Lerntage je Bereich, Staffel, Einfluss-Klassen, korrigierte Zahlen).

Übernimm die Regeln aus Abschnitt 1 bis 3 nach `src/coach/inhalt/LIESMICH.md`. Die Muster ab Abschnitt 4 zeigen Ton, Tiefe und Aufbau – schreib die übrigen Inhalte auf diesem Niveau, nicht darunter.

## 1. Schreibregeln

**Sprache**
- Du-Form. Kurze Sätze, tätige Verben, ein Gedanke je Satz.
- Fachbegriffe und Abkürzungen beim ersten Auftreten in einem Halbsatz erklären.
- Deutsch, wo es ein treffendes deutsches Wort gibt.
- Kein „du musst“, kein „einfach“ als Verharmlosung, keine Ausrufezeichen-Ketten.
- Die Lerninhalte sind im neutralen Grundton geschrieben. Nur Coach-Zeilen gibt es in drei Tönen.

**Ehrlichkeit**
- Jede Einheit trägt eine Beleg-Stufe: **A** belegt (Meta-Analysen, mehrfach bestätigt) · **B** gestützt (einzelne gute Studien) · **P** Praxiswissen · **D** Denkmodell · **U** umstritten oder Mythos.
- Zahlen nur mit Quelle aus `quellen.json`. Ohne Quelle: ohne Zahl formulieren.
- Bei B, D und U gehört ein `belegHinweis` dazu: was gesichert ist und was nicht.
- Keine Versprechen: nie „garantiert“, „für immer“, „in sieben Tagen“.

**Aufbau einer Einheit**
- 5 bis 9 Schritte, mindestens drei verschiedene Formate, mindestens zwei aktive.
- Der erste Schritt weckt Neugier (Schätzfrage, Mythos, Vergleich oder eine kleine Szene) – nie eine Textwand.
- Der letzte Schritt ist die Mission. Wo keine Aufgabe für draußen passt (in `05_LEHRPLAN.md` mit „–“ gekennzeichnet), endet die Einheit mit einer Reflexion oder mit `fachhilfe`; das Feld `mission` fehlt dann.
- Auswahlfragen: genau eine beste Antwort (`wert: 2`), mindestens eine brauchbare (`wert: 1`). Jede Begründung lehrt etwas – auch bei den schwachen Antworten.
- Freie Antworten: immer mit Kriterien und zwei bis drei Musterlösungen in verschiedenen Spielarten.
- Jede Übung trägt Fähigkeit, Stufe (1–10) und Kanal.

**Längen**

| Feld | höchstens |
|---|---|
| Titel | 48 Zeichen |
| Aha | 220 |
| Erklärkarte | 420 |
| Regel | 90 |
| Antwortmöglichkeit | 120 |
| Begründung | 200 |
| Coach-Zeile | 110 |

**Beispiele und Figuren**
- Lagen aus Büro, Familie, Verein, Nachbarschaft, Alltag. Stammbesetzung aus `05_LEHRPLAN.md`.
- Keine echten Personen, keine Marken, keine Politik, keine Religion als Streitthema, nichts Anzügliches.
- Alle Sätze selbst geschrieben. Nichts aus Büchern, Vorträgen oder Liedern übernehmen.
- Platzhalter: `{name}` (Vorname, falls angegeben; sonst entfällt die Anrede).

**Kennungen**
- Eingefroren, sobald ausgeliefert. Korrekturen am Text ja, neue Bedeutung nur unter neuer Kennung.

## 2. Verbotene Wörter und Wendungen

Das Prüfskript meldet sie als Fehler (außer im Feld `aussage` eines Mythos):

`garantiert` · `für immer` · `nie wieder` · `heilen` / `Heilung` (als Versprechen) · `Sprachfehler` · `Stotterer` · `bekämpfen` / `besiegen` (bei Sprechen und Nervosität) · `Versager` · `Loser` · `Alpha` · `rumkriegen` · `Trick 17` · `Geheimwaffe` · `Gehirnwäsche` · `du musst` · `reiß dich zusammen` · `stell dich nicht so an` · `normal` als Gegensatz zu Menschen mit einer Sprechstörung

## 3. Sonderregeln für einzelne Bereiche

**Laut und leise.** Jede Übung mit `laut: true` nennt in `leise` die Kennung einer stillen Ersatzübung mit demselben Lernziel (stumm überdeutlich sprechen, Erkennen, Planen). Ohne Ersatz meldet das Prüfskript einen Fehler.

**`aussprache`**
- Keine Übung behauptet, einen Laut automatisch zu beurteilen. Der Nutzer prüft selbst – mit Prüfliste, Spiegel, Aufnahme.
- Übungssätze sind alltagstauglich („Ich rufe Sie morgen gegen zehn zurück“), keine Zungenakrobatik ohne Sinn. Zungenbrecher nur als Aufwärmen und selbst geschrieben.
- Umgangssprachliche Verschleifungen werden nicht als Fehler bezeichnet, sondern als Wahl.
- Lesetexte tragen die Silbenzahl; das Prüfskript zählt nach.

**Schwerpunkt Lispeln**
- Jede Einheit enthält den Baustein `fachhilfe` (Weg zur Logopädie).
- Zu jeder Anleitung gehört die Prüfung („Zunge im Spiegel nicht zu sehen? Luft in der Mitte spürbar?“).
- Bei seitlich entweichender Luft steht der Rat zur Logopädie vor jeder Übung.

**Schwerpunkt Stottern**
- Keine Uhr, keine Tempo-Angabe, kein Zählen, kein „flüssig“ als Lob oder Ziel.
- Keine Ratschläge der Art „sprich langsamer“, „atme vorher“, „entspann dich“.
- Kein nachgeahmtes Stottern in der Schrift, kein Ton-Beispiel.
- Sprache: „Menschen, die stottern“; „leichter“, „freier“, „gesagt, was du sagen wolltest“.
- Jede Einheit endet mit `fachhilfe` (Therapie und Selbsthilfe).
- Rückmeldungen loben das Sprechen und das Nicht-Vermeiden.

**`ruhe`**
- Verben: „senkt“, „hilft vielen“, „probier aus“ – nie „weg“, „besiegt“, „abschalten“.
- Jede Anleitung dauert höchstens 90 Sekunden und ist auch im Stehen und unauffällig machbar.
- Atemübungen tragen den Hinweis: Bei Schwindel aufhören und normal atmen; nicht am Steuer.
- Nach jedem Werkzeug die Abfrage „Anspannung vorher / nachher“ (überspringbar).

**`ueberzeugen`**
- Jede Einheit besteht den Transparenz-Test (`01_KONZEPT.md`, Abschnitt 18): Das gelehrte Mittel wirkt auch dann, wenn der andere es durchschaut.
- Beispiele zeigen ein Gegenüber, das frei entscheidet. Auch ein Nein kommt als guter Ausgang vor.
- Tricks stehen nur im Format `kunstgriff` und im Mythen-Check – nie als Empfehlung.
- Preise und Zahlen in Beispielen sind runde, erkennbar ausgedachte Werte; keine Marken, keine echten Firmen.
- Musterlösungen zur Selbstdarstellung nennen Leistungen offen und belegt, ohne Übertreibung und ohne getarntes Eigenlob.

**`flirten`, Missionen, Tiefenblick:** Regeln in `01_KONZEPT.md`, Abschnitt 18, und `04`, Abschnitt 5.

## 4. Aufbau der Schritte (Auszug)

Der Kopf einer Einheit steht in `02_TECHNIK.md`, Abschnitt 4. Die wichtigsten Schritt-Arten – die übrigen baust du nach demselben Muster und legst sie im Plan vor:

```ts
type Kopf = { id: string; faehigkeit: string; stufe: number; kanal: 'wissen' | 'koennen';
              laut?: boolean; leise?: string; uhr?: boolean }

type Schritt =
  | { art: 'karte'; text: string; bild?: string }
  | { art: 'schaetzen'; frage: string; loesung: string; aufloesung: string }
  | { art: 'mythos'; aussage: string; urteil: 'stimmt' | 'teils' | 'falsch'; warum: string }
  | { art: 'vergleich'; lage: string; schwach: string; stark: string; frage: string; unterschied: string }
  | { art: 'auswahl'; kopf: Kopf; frage: string; sicherheit?: boolean;
      antworten: { text: string; wert: 0 | 1 | 2; warum: string; tendenz?: string }[] }
  | { art: 'zuordnen'; kopf: Kopf; auftrag: string; faecher: string[]; karten: { text: string; fach: number }[] }
  | { art: 'konter'; kopf: Kopf; lage: string; von: string; spruch: string; schaerfe: 1 | 2 | 3;
      muster: { technik: string; text: string }[]; kriterien: string[] }
  | { art: 'umformulieren'; kopf: Kopf; auftrag: string; vorlage: string; kriterien: string[]; muster: string[] }
  | { art: 'atem'; werkzeug: string; schritte: string[]; takt: { ein: number; aus: number; runden: number };
      hinweis: string; messen: boolean; ton?: string }
  | { art: 'lockern'; uebungen: string[]; sekunden: number; stummMoeglich: boolean }
  | { art: 'nachsprechen'; kopf: Kopf; auftrag: string; zeilen: string[];
      weise: 'gewohnt' | 'ueberdeutlich' | 'klar'; pruefliste: string[]; ton?: string }
  | { art: 'klartext'; kopf: Kopf; text: string; pruefliste: string[] }      // drei Durchgänge, fest
  | { art: 'routine'; bausteine: string[]; mindestens: 3; hoechstens: 5 }
  | { art: 'reflexion'; frage: string; insBuch?: 'erfolg' | 'saetze' | 'geschichten' }
  | { art: 'fachhilfe'; thema: 'logopaedie' | 'stottern' | 'seele' | 'notfall' }
  | { art: 'mission'; ref: string }
```

## 5. Muster-Einheit: `konter-1-01`

```json
{
  "id": "konter-1-01",
  "bereich": "konter",
  "stufe": 1,
  "nr": 1,
  "titel": "Mitspielen statt kontern",
  "faehigkeiten": ["konter.spiel"],
  "dauerMin": 6,
  "beleg": "B",
  "belegHinweis": "Improvisationsübungen fördern nachweislich Einfallsreichtum und Gelassenheit bei Ungewissem. Dass genau diese Technik schlagfertiger macht, ist Praxiswissen.",
  "quellen": ["felsman2020"],
  "aha": "Wenn jemand witzig ist, musst du nicht witziger sein. Greif das Bild auf und geh einen Schritt weiter – das genügt, und es verbindet.",
  "schritte": [
    {
      "art": "vergleich",
      "lage": "Der Drucker streikt zum dritten Mal. Tarek: „Für den Drucker gründe ich bald eine Selbsthilfegruppe.“",
      "schwach": "„Ja, der nervt echt.“",
      "stark": "„Ich bring Kekse mit. Treffen wir uns dienstags?“",
      "frage": "Was macht die zweite Antwort anders?",
      "unterschied": "Sie nimmt Tareks Bild ernst und baut es aus. Die erste stimmt nur zu – damit ist das Spiel vorbei."
    },
    {
      "art": "karte",
      "text": "Witzige Menschen suchen selten einen Gegner. Sie suchen jemanden, der mitspielt. Das Prinzip kommt aus dem Improvisationstheater: annehmen, was der andere anbietet, und ein Stück dazulegen. Kurz: Ja, und."
    },
    {
      "art": "auswahl",
      "kopf": { "id": "konter-1-01-a", "faehigkeit": "konter.spiel", "stufe": 2, "kanal": "wissen" },
      "frage": "Miriam schaut auf dein überquellendes Postfach: „Dein Postfach hat Burn-out.“ Welche Antwort spielt mit?",
      "antworten": [
        { "text": "„Es ist seit Montag krankgeschrieben. Ich mache die Vertretung.“", "wert": 2, "warum": "Du nimmst das Bild an und führst es weiter." },
        { "text": "Lachen und sagen: „Der war gut.“", "wert": 1, "warum": "Ehrliches Lachen ist eine vollwertige Antwort. Nur geht das Spiel nicht weiter." },
        { "text": "„Deins sieht auch nicht besser aus.“", "wert": 0, "tendenz": "angreifen", "warum": "Das dreht den Spieß um. Aus dem Spiel wird ein Schlagabtausch." },
        { "text": "„Ich habe eben viel zu tun.“", "wert": 0, "tendenz": "rechtfertigen", "warum": "Du verteidigst dich gegen etwas, das kein Angriff war." }
      ]
    },
    {
      "art": "konter",
      "kopf": { "id": "konter-1-01-b", "faehigkeit": "konter.spiel", "stufe": 3, "kanal": "koennen" },
      "lage": "Montagmorgen, Kaffeeküche. Die Maschine gibt nur noch heißes Wasser.",
      "von": "Tarek",
      "spruch": "„Die Maschine hat innerlich gekündigt.“",
      "schaerfe": 1,
      "muster": [
        { "technik": "weiterspinnen", "text": "„Dann brauchen wir ein Abschiedsgeschenk. Entkalker.“" },
        { "technik": "rolle", "text": "„Ich rede mit ihr. Wir hatten immer einen guten Draht.“" },
        { "technik": "ernst", "text": "„Verständlich. Seit Jahren kein Urlaub.“" }
      ],
      "kriterien": ["greift das Bild auf", "fügt etwas hinzu", "bleibt freundlich"]
    },
    { "art": "reflexion", "frage": "Wer in deinem Umfeld macht gern solche Sprüche? Bei wem probierst du es zuerst aus?" },
    { "art": "mission", "ref": "konter-leiter-01" }
  ],
  "regel": "Nicht übertrumpfen – aufgreifen und einen Schritt weitergehen.",
  "merkkarten": [
    { "frage": "Jemand macht einen Scherz. Was ist deine Aufgabe?", "antwort": "Mitspielen: das Bild annehmen und ein Stück dazulegen." },
    { "frage": "Dir fällt nichts ein. Was geht immer?", "antwort": "Ehrlich lachen und es sagen: „Der war gut.“" }
  ],
  "mission": "konter-leiter-01"
}
```

## 6. Muster-Einheit: `ruhe-1-04`

```json
{
  "id": "ruhe-1-04",
  "bereich": "ruhe",
  "stufe": 1,
  "nr": 4,
  "titel": "Lang ausatmen",
  "faehigkeiten": ["ruhe.atem"],
  "dauerMin": 6,
  "beleg": "A",
  "belegHinweis": "Atemübungen senken empfundenen Stress im Mittel mäßig; für die Seufzer-Atmung gibt es eine gute Einzelstudie. Wie viel eine einzelne Minute direkt vor einem Auftritt bringt, ist kaum untersucht – deshalb misst du es bei dir selbst.",
  "quellen": ["fincham2023", "zaccaro2018", "balban2023"],
  "aha": "Nicht tief einatmen – lang ausatmen. Das lange Ausatmen sagt dem Körper, dass er einen Gang herunterschalten darf.",
  "schritte": [
    { "art": "mythos", "aussage": "Wer aufgeregt ist, sollte ein paarmal tief Luft holen.", "urteil": "teils",
      "warum": "Hastig tief einzuatmen treibt eher an und kann schwindlig machen. Was hilft, ist das lange Ausatmen danach." },
    { "art": "karte", "text": "Beim Einatmen schlägt das Herz ein wenig schneller, beim Ausatmen ein wenig langsamer. Wer länger aus- als einatmet, schiebt den Körper Richtung Erholung. Faustregel: aus etwa doppelt so lang wie ein." },
    { "art": "atem", "werkzeug": "ausatmen",
      "schritte": ["Durch die Nase einatmen – zähl bis vier.", "Lippen leicht spitzen, als wolltest du eine Kerze zum Flackern bringen.", "Langsam ausatmen – zähl bis acht.", "Sechs Runden."],
      "takt": { "ein": 4, "aus": 8, "runden": 6 },
      "hinweis": "Wird dir schwummrig: aufhören und normal weiteratmen. Nicht am Steuer.", "messen": true },
    { "art": "atem", "werkzeug": "seufzer",
      "schritte": ["Durch die Nase einatmen.", "Gleich noch einen kleinen Zug obendrauf.", "Lang durch den Mund ausatmen.", "Vier Runden."],
      "takt": { "ein": 3, "aus": 7, "runden": 4 },
      "hinweis": "Wird dir schwummrig: aufhören und normal weiteratmen. Nicht am Steuer.", "messen": true },
    { "art": "auswahl",
      "kopf": { "id": "ruhe-1-04-a", "faehigkeit": "ruhe.atem", "stufe": 2, "kanal": "wissen" },
      "frage": "Du stehst vor der Tür zum Besprechungsraum, noch eine Minute. Was bringt am meisten?",
      "antworten": [
        { "text": "Fünfmal lang ausatmen, dann den ersten Satz halblaut.", "wert": 2, "warum": "Ausatmen senkt die Anspannung, der erste Satz gibt Halt für die schwerste Minute." },
        { "text": "Die Notizen noch einmal ganz durchgehen.", "wert": 1, "warum": "Beruhigt manche, hält dich aber im Kopf. Besser: nur den ersten Satz." },
        { "text": "Dreimal schnell tief Luft holen.", "wert": 0, "warum": "Schnelles tiefes Einatmen treibt eher an." },
        { "text": "Dir sagen: Bleib ruhig, bleib ruhig.", "wert": 0, "tendenz": "unterdruecken", "warum": "Gegen das Gefühl anzukämpfen verstärkt es meist." }
      ] },
    { "art": "reflexion", "frage": "Vor welchem Moment in dieser Woche probierst du das aus?" },
    { "art": "mission", "ref": "ruhe-leiter-01" }
  ],
  "regel": "Nicht tief ein – lang aus.",
  "merkkarten": [
    { "frage": "Worauf kommt es beim Atmen gegen Aufregung an?", "antwort": "Aufs lange Ausatmen – etwa doppelt so lang wie das Einatmen." },
    { "frage": "Wie geht die Seufzer-Atmung?", "antwort": "Zweimal kurz durch die Nase ein, lang durch den Mund aus." }
  ],
  "mission": "ruhe-leiter-01"
}
```

## 7. Muster-Einheit: `aussprache-1-02`

```json
{
  "id": "aussprache-1-02",
  "bereich": "aussprache",
  "stufe": 1,
  "nr": 2,
  "titel": "Der Klar-Modus steckt schon in dir",
  "faehigkeiten": ["aussprache.hoeren", "aussprache.alltag"],
  "dauerMin": 7,
  "beleg": "A",
  "belegHinweis": "Dass deutliches Sprechen die Verständlichkeit hebt, ist vielfach gezeigt. Dass die Anweisung „überdeutlich“ am meisten bringt, stammt aus einzelnen Studien.",
  "quellen": ["smiljanic2009", "lam2012"],
  "aha": "Bittet man Menschen, überdeutlich zu sprechen, werden sie sofort besser verstanden. Du lernst nichts Neues – du rufst ab, was schon da ist.",
  "schritte": [
    { "art": "schaetzen", "frage": "Forscher ließen denselben Satz einmal wie gewohnt und einmal deutlich sprechen. Um wie viel besser wurde er verstanden?",
      "loesung": "je nach Studie um bis zu rund 26 Prozentpunkte",
      "aufloesung": "Der Gewinn kam sofort – ohne Training. Die Fähigkeit ist da. Sie wird nur selten abgerufen." },
    { "art": "karte", "text": "Deutliches Sprechen hat fünf Zutaten: etwas langsamer, mehr Pausen, größere Mundbewegung, zu Ende gesprochene Wörter, etwas mehr Stimme. Am stärksten wirkt die Anweisung: Sprich jedes Wort überdeutlich. Danach nimmst du die Übertreibung zurück – ein Teil der Klarheit bleibt." },
    { "art": "klartext",
      "kopf": { "id": "aussprache-1-02-a", "faehigkeit": "aussprache.hoeren", "stufe": 2, "kanal": "koennen", "laut": true, "leise": "aussprache-1-02-s" },
      "text": "lesetext-01",
      "pruefliste": ["Mund sichtbar bewegt?", "Wortenden zu hören?", "Pausen gesetzt?"] },
    { "art": "auswahl",
      "kopf": { "id": "aussprache-1-02-b", "faehigkeit": "aussprache.alltag", "stufe": 2, "kanal": "wissen" },
      "frage": "Wann lohnt sich der Klar-Modus am meisten?",
      "antworten": [
        { "text": "Bei allem mit Namen, Zahlen oder Terminen – und am Telefon.", "wert": 2, "warum": "Dort lässt sich nichts aus dem Zusammenhang erraten, und niemand sieht deinen Mund." },
        { "text": "Immer und überall, den ganzen Tag.", "wert": 1, "warum": "Gut gemeint, aber Dauerkontrolle macht steif. Feste Momente wirken besser." },
        { "text": "Sobald jemand nachfragt.", "wert": 0, "warum": "Dann ist es schon passiert – und viele fragen gar nicht nach." },
        { "text": "Nur vor großem Publikum.", "wert": 0, "warum": "Die meisten Missverständnisse entstehen im Kleinen: am Telefon, im Flur, in der Runde." }
      ] },
    { "art": "nachsprechen",
      "kopf": { "id": "aussprache-1-02-c", "faehigkeit": "aussprache.alltag", "stufe": 2, "kanal": "koennen", "laut": true, "leise": "aussprache-1-02-t" },
      "auftrag": "Deine Telefonbegrüßung im Klar-Modus.",
      "zeilen": ["Guten Morgen, {name} am Apparat.", "Was kann ich für Sie tun?"],
      "weise": "klar",
      "pruefliste": ["Name in klaren Silben?", "Kleine Pause nach dem Namen?"] },
    { "art": "mission", "ref": "aussprache-leiter-04" }
  ],
  "regel": "Erst übertreiben, dann zurücknehmen – die Klarheit bleibt.",
  "merkkarten": [
    { "frage": "Welche Anweisung macht am schnellsten deutlicher?", "antwort": "„Sprich jedes Wort überdeutlich“ – danach die Übertreibung zurücknehmen." },
    { "frage": "Die fünf Zutaten deutlichen Sprechens?", "antwort": "Etwas langsamer, mehr Pausen, Mund auf, Wörter zu Ende, etwas mehr Stimme." }
  ],
  "mission": "aussprache-leiter-04"
}
```

Stille Ersatzübungen dazu (im Vorrat): `aussprache-1-02-s` – „Sprich die drei Sätze stumm und überdeutlich, nur mit Lippen, Zunge und Kiefer. Spür, wie viel sich bewegt.“ · `aussprache-1-02-t` – „Schreib deine Telefonbegrüßung auf und setz zwei Pausenzeichen.“

## 8. Muster-Einheit: `aussprache-s-01` (Schwerpunkt Stottern)

Dieses Muster zeigt den Ton für die empfindlichsten Inhalte der App: sachlich, entlastend, ohne Mitleid, ohne Versprechen.

```json
{
  "id": "aussprache-s-01",
  "bereich": "aussprache",
  "schwerpunkt": "stottern",
  "stufe": 1,
  "nr": 1,
  "titel": "Was Stottern ist – und was nicht",
  "faehigkeiten": ["aussprache.redefluss"],
  "dauerMin": 6,
  "beleg": "A",
  "belegHinweis": "Grundlage ist die deutsche Leitlinie zu Störungen des Redeflusses. Was genau im Gehirn anders läuft, ist noch nicht vollständig geklärt.",
  "quellen": ["s3stottern", "baekstottern", "bvssfakten", "chor"],
  "aha": "Stottern ist neurologisch bedingt. Es hat nichts mit Nervosität, Erziehung oder Klugheit zu tun – und es ist nicht deine Schuld.",
  "schritte": [
    { "art": "mythos", "aussage": "Menschen stottern, weil sie nervös sind.", "urteil": "falsch",
      "warum": "Aufregung kann Stottern verstärken, sie verursacht es nicht. Dahinter steht eine Veranlagung, die das Zusammenspiel beim Sprechen betrifft." },
    { "art": "karte", "text": "Wer stottert, weiß genau, was er sagen will. Das Sprechen gerät unwillkürlich ins Stocken: Laute wiederholen sich, werden gedehnt oder bleiben stecken. Etwa einer von hundert Erwachsenen stottert." },
    { "art": "zuordnen",
      "kopf": { "id": "aussprache-s-01-a", "faehigkeit": "aussprache.redefluss", "stufe": 2, "kanal": "wissen" },
      "auftrag": "Was ist belegt, was ist ein Irrtum?",
      "faecher": ["belegt", "Irrtum"],
      "karten": [
        { "text": "Die Veranlagung ist der wichtigste Faktor.", "fach": 0 },
        { "text": "Müdigkeit und Zeitdruck können es verstärken.", "fach": 0 },
        { "text": "Es beginnt meist in der frühen Kindheit.", "fach": 0 },
        { "text": "Es zeigt, dass jemand schüchtern ist.", "fach": 1 },
        { "text": "Die Eltern haben etwas falsch gemacht.", "fach": 1 },
        { "text": "Wer sich genug anstrengt, kann es lassen.", "fach": 1 }
      ] },
    { "art": "karte", "text": "Sprechen Menschen, die stottern, im Chor mit einer zweiten Stimme, verschwindet das Stocken bei den meisten fast ganz. Für den Alltag taugt das nicht – aber es zeigt: Mit Wollen hat Stottern nichts zu tun." },
    { "art": "auswahl",
      "kopf": { "id": "aussprache-s-01-b", "faehigkeit": "aussprache.redefluss", "stufe": 2, "kanal": "wissen" },
      "frage": "Jemand rät dir: „Sprich doch langsamer.“ Welche Antwort passt am besten?",
      "antworten": [
        { "text": "„Gut gemeint – mir hilft am meisten, wenn du mich ausreden lässt.“", "wert": 2, "warum": "Du ordnest den Rat ein und sagst, was dir wirklich hilft." },
        { "text": "Nichts sagen und das Thema wechseln.", "wert": 1, "warum": "Verständlich und manchmal richtig. Auf Dauer bleibt der Irrtum so stehen." },
        { "text": "„Stimmt, ich sollte mich mehr konzentrieren.“", "wert": 0, "warum": "Stottern ist keine Frage der Konzentration. Der Rat übersieht, wie es entsteht." }
      ] },
    { "art": "reflexion", "frage": "Welcher Irrtum über das Stottern ist dir am häufigsten begegnet? Was würdest du heute darauf sagen?", "insBuch": "saetze" },
    { "art": "fachhilfe", "thema": "stottern" }
  ],
  "regel": "Es liegt nicht an dir – und es lässt sich etwas tun.",
  "merkkarten": [
    { "frage": "Was ist die wichtigste Ursache des Stotterns?", "antwort": "Eine Veranlagung, die das Zusammenspiel beim Sprechen betrifft – nicht Nervosität, nicht Erziehung." },
    { "frage": "Was hilft im Gespräch mit Menschen, die stottern?", "antwort": "Blickkontakt, Geduld, ausreden lassen – keine Ratschläge." }
  ]
}
```

Diese Einheit hat keine Mission; das Feld fehlt. Solche Einheiten enden mit einer Reflexion oder mit `fachhilfe`.

**Texte für den Baustein `fachhilfe`** (liegen in `inhalt/notfall.json`; vor Auslieferung alle Angaben prüfen):

| Thema | Text |
|---|---|
| `logopaedie` | Für die saubere Anbahnung eines Lauts ist Logopädie – Sprech- und Sprachtherapie – der beste Weg. Du brauchst eine ärztliche Verordnung, zum Beispiel aus der Hausarzt- oder HNO-Praxis. Gesetzlich Versicherte ab 18 zahlen zehn Prozent der Kosten und zehn Euro je Verordnung. Praxen findest du über die Berufsverbände der Logopädie. |
| `stottern` | Stottertherapie wirkt – in jedem Alter. Anerkannt sind Verfahren, die eine neue Sprechweise aufbauen, und Verfahren, die das Stottern selbst verändern. Erste Anlaufstelle ist die Hausarztpraxis. Unabhängige Beratung und Selbsthilfegruppen bietet die Bundesvereinigung Stottern & Selbsthilfe (www.bvss.de). Wer schnelle Heilung verspricht, ist unseriös. |
| `seele` | Wenn dich etwas stark belastet: Sprich mit deiner Hausarztpraxis oder ruf die 116 117 an (Termin für eine psychotherapeutische Sprechstunde). Rund um die Uhr erreichbar ist die Telefonseelsorge: 0800 111 0 111, 0800 111 0 222 oder 116 123. |
| `notfall` | Plötzlich verwaschene Sprache, ein hängender Mundwinkel oder ein kraftloser Arm: sofort 112. |

## 9. Muster: Dialog

Verzweigtes Gespräch; jede Wahl hat eine Folge und eine kurze Rückmeldung. Am Ende wertet der Coach nach Prinzipien aus, nicht nach Punkten. Das Muster ist ein Auszug: Die Knoten `k1b` und `k3` fehlen hier.

```json
{
  "id": "smalltalk-dialog-01",
  "bereich": "smalltalk",
  "titel": "Der Empfang",
  "figur": "Lena Brandt",
  "lage": "Firmenempfang. Lena, die neue Kollegin, steht allein am Stehtisch und schaut in ihr Glas.",
  "start": "k1",
  "knoten": [
    { "id": "k1", "sagt": "",
      "wahl": [
        { "text": "„Hallo, ich bin {name}. Du bist neu bei uns, oder? Wie waren die ersten Wochen?“", "wert": 2, "weiter": "k2", "rueck": "Name, Beobachtung, offene Frage – ein Einstieg aus dem Raum." },
        { "text": "„Na, auch hier?“", "wert": 1, "weiter": "k2", "rueck": "Freundlich, gibt ihr aber wenig zum Anknüpfen." },
        { "text": "Dazustellen, nicken, aufs Handy schauen.", "wert": 0, "tendenz": "ausweichen", "weiter": "k1b", "rueck": "Nähe ohne Angebot. Jetzt ist es für beide unbequemer." }
      ] },
    { "id": "k2", "sagt": "„Ganz gut, danke. Viel Neues. Ich komme aus Leipzig und kenne hier noch kaum jemanden.“",
      "wahl": [
        { "text": "„Leipzig! Was fehlt dir von dort am meisten?“", "wert": 2, "weiter": "k3", "rueck": "Du greifst auf, was sie freiwillig geliefert hat, und fragst nach dem Erleben." },
        { "text": "„Ich war auch mal in Leipzig, das war 2019, da hatten wir …“", "wert": 0, "tendenz": "uebertrumpfen", "weiter": "k3", "rueck": "Jetzt geht es um dich. Ihr Aufhänger liegt ungenutzt da." },
        { "text": "„Und in welcher Abteilung bist du?“", "wert": 1, "tendenz": "ausfragen", "weiter": "k3", "rueck": "Geht, wirkt aber wie eine Liste. Sie hat dir Besseres angeboten." }
      ] }
  ],
  "prinzipien": ["Einstieg aus dem Raum", "Aufhänger aufgreifen", "erst würdigen, dann fragen", "guter Abgang"]
}
```

## 10. Muster: Vorräte

**Sprüche fürs Konter-Training** – immer in drei Schärfen, Musterantworten nie verletzend:

| Schärfe | Von | Spruch | Musterantworten (Technik) |
|---|---|---|---|
| 1 neckend | Sven | „Na, auch schon wach?“ | „Körperlich ja.“ (untertreiben) · „Ich wollte sichergehen, dass ihr mich vermisst.“ (zustimmen und überzeichnen) |
| 2 stichelnd | Kollege | „Für die Tabelle hast du drei Tage gebraucht?“ | „Zwei für die Tabelle, einen für die Fehler der Vorlage. Welcher Teil eilt dir?“ (übersetzen) · „Wie meinst du das?“ (Rückfrage) |
| 3 übergriffig | Bekannter | „Bei deinem Gehalt würde ich auch so gucken.“ | „Das ging unter die Gürtellinie. Zurück zur Sache.“ (Grenze) · „Kann man so sehen.“ – und weiter (stehen lassen) |

**Zeitdruck-Aufgaben:** „Drei Einstiege für eine Kochgruppe – 30 Sekunden.“ · „Fünf Fragen zum Thema Garten – 30 Sekunden.“ · „Zehn Übertreibungen für ‚Es regnet‘ – 60 Sekunden.“ (Bei „ohne Zeitdruck“: dieselbe Aufgabe ohne Uhr.)

**Umformulieren:** „Das geht nicht vor Freitag.“ → „Das schaffe ich bis Freitag.“ (positiv) · „Ich würde vielleicht vorschlagen wollen, dass wir das verschieben.“ → „Ich schlage vor, wir verschieben das.“ (ohne Weichmacher)

**Nachsprechen, nach Ziel geordnet:**

| Ziel | Zeilen |
|---|---|
| Wortenden | „Ich rufe Sie morgen gegen zehn zurück.“ · „Das habe ich nicht gewusst.“ · „Wir haben den Termin verschoben.“ |
| Lautgruppen | „Die Strecke ist streckenweise gesperrt.“ · „Pflichtbewusst pflegt er den Plan.“ |
| Namen und Zahlen | „Wegner mit e, wie Essen.“ · „Der Termin ist am vierzehnten, nicht am vierzigsten.“ |
| S-Laute (nur Schwerpunkt Lispeln) | „Das passt.“ · „Sechs Seiten sind es insgesamt.“ |

**Eigene Zungenbrecher** (nur als Aufwärmen): „Tarek tippt tapfer zwölf trockene Tabellentitel.“ · „Petra packt praktische Pakete für Peters Projekt.“ · „Sechs frische Fische wünscht sich Frau Sommer zum Sonntag.“

**Lesetext** (für `klartext` und die Startaufnahme):

```json
{
  "id": "lesetext-01",
  "text": "Am Samstag fährt Familie Petersen an die Ostsee. Die Strecke führt zwischen Feldern, Brücken und kleinen Städten hindurch. Im Abteil riecht es nach Kaffee und frischen Brötchen. Die Kinder drängen ans Fenster und zählen die Schiffe am Horizont. Kurz vor dem Ziel öffnet sich der Blick: Wasser, so weit das Auge reicht.",
  "woerter": 52,
  "silben": 80
}
```

Die Silbenzahl ist von Hand gezählt („Familie“ mit vier Silben). Das Prüfskript zählt nach; weicht es ab, klärst du die Abweichung, statt die Zahl stillschweigend zu ändern.

## 11. Muster: Mission und Werkzeug

```json
{
  "id": "ruhe-leiter-04",
  "bereich": "ruhe",
  "stufe": 4,
  "titel": "Die Startroutine vor einer normalen Besprechung",
  "auftrag": "Geh deine Startroutine durch, bevor du den Raum betrittst – auch wenn nichts auf dem Spiel steht. Gerade dann wird sie zur Gewohnheit.",
  "vorher": ["befuerchtung", "wahrscheinlichkeit", "anspannung"],
  "planVorlage": "Wenn ich die Tür zum Besprechungsraum sehe, dann …",
  "nachher": ["eingetreten", "passiert", "anspannung", "mitnehmen"]
}
```

```json
{
  "id": "seufzer",
  "titel": "Seufzer-Atmung",
  "sekunden": 40,
  "schritte": ["Durch die Nase einatmen.", "Gleich noch einen kleinen Zug obendrauf.", "Lang durch den Mund ausatmen.", "Vier Runden."],
  "unauffaellig": true,
  "beleg": "B",
  "quellen": ["balban2023"],
  "hinweis": "Wird dir schwummrig: aufhören und normal weiteratmen. Nicht am Steuer."
}
```

## 12. Muster: Coach-Zeilen in drei Tönen

Jeder Anlass hat je Ton mindestens drei Fassungen, damit sich nichts abnutzt.

| Anlass | ruhig | klar | trocken |
|---|---|---|---|
| Begrüßung | „Schön, dass du da bist. Zehn Minuten – mehr braucht es heute nicht.“ | „Da bist du. Zehn Minuten. Los.“ | „Du schon wieder. Gut so.“ |
| richtig | „Genau so. Merk dir, wie du darauf gekommen bist.“ | „Sitzt. Weiter.“ | „Richtig. Ich bin fast beeindruckt.“ |
| falsch | „Knapp daneben – und genau daraus lernst du jetzt etwas.“ | „Daneben. Schau dir an, warum – dann sitzt es beim nächsten Mal.“ | „Daneben. Passiert den Besten. Und uns.“ |
| Rückkehr nach Pause | „Schön, dich zu sehen. Wir fangen klein an.“ | „Wieder da. Das zählt. Drei Minuten, dann sehen wir weiter.“ | „Die Halle stand die ganze Zeit offen. Komm rein.“ |
| Mission erledigt | „Das war mutig. Was nimmst du daraus mit?“ | „Gemacht. Genau so wächst das.“ | „Du hast es getan und lebst noch. Notier das.“ |
| kurz vor einem Ernstfall | „Aufgeregt ist in Ordnung. Du kennst deinen ersten Satz.“ | „Ausatmen. Erster Satz. Dann läuft es.“ | „Dein Herz klopft? Gut. Es arbeitet für dich.“ |
| nach einer Aufnahme | „Hör dir beide Fassungen an. Welchen Unterschied bemerkst du?“ | „Anhören. Vergleichen. Was war besser?“ | „Die zweite Fassung käme sogar am Bahnsteig durch.“ |
| Schwerpunkt Stottern, nach einer Mission | „Du hast gesagt, was du sagen wolltest. Darum geht es.“ | „Gesagt ist gesagt. Das zählt.“ | „Gesagt, was du sagen wolltest. Mehr wollte ich nicht sehen.“ |

Der trockene Ton spottet nie über den Nutzer, nie über Figuren mit einer Einschränkung und im Schwerpunkt Stottern gar nicht.

## 13. Muster: Erinnerungen an Vorhaben in drei Schärfen

| Vorhaben | sanft | normal | Arschtritt |
|---|---|---|---|
| Bewegung | „Zehn Minuten draußen würden dir jetzt guttun. Magst du?“ | „Schuhe an, zehn Minuten. Danach bist du froh.“ | „Du wolltest laufen. Die Schuhe laufen nicht von allein. Hoch mit dir.“ |
| Partnerschaft | „Eine kleine Freude für {partner}? Eine Nachricht reicht.“ | „Wann hast du {partner} zuletzt überrascht? Heute wäre ein guter Tag.“ | „Du wolltest aufmerksamer sein. Schreib die Nachricht. Jetzt.“ |
| Lesen | „Zwei Seiten vor dem Schlafen?“ | „Das Buch liegt bereit. Zehn Minuten.“ | „Zwei Seiten. Das Handy kann warten – das Buch wartet schon länger.“ |
| Sprache | „Fünf Minuten Italienisch? Der Kurs wartet.“ | „Kurze Runde im Sprachkurs – ich bringe dich hin.“ | „Du wolltest die Sprache lernen. Fünf Minuten. Die Tür ist offen.“ |

- `{partner}` ist das Wort, das der Nutzer selbst eingetragen hat. Im Diskret-Modus erscheint der Text erst nach einem Klick.
- Bei „Sprache“ gibt es den Knopf „Zum Kurs“, wenn der Host das Ziel öffnen kann.
- Der Arschtritt ist frech, nie verletzend: kein Wort über Körper, Leistung oder Charakter, keine Schuldgefühle.

## 14. Muster: Formcheck

```json
{
  "bereich": "ruhe",
  "szenarien": [
    { "id": "ruhe-fc-01", "faehigkeit": "ruhe.umdeuten", "stufe": 4,
      "frage": "Zwei Minuten vor deinem Beitrag merkst du, dass dein Herz rast. Was sagst du dir?",
      "antworten": [
        { "text": "„Mein Körper stellt Energie bereit. Erster Satz, dann läuft es.“", "wert": 2 },
        { "text": "„Ganz ruhig. Es ist doch nichts.“", "wert": 1, "tendenz": "unterdruecken" },
        { "text": "„Wenn die das merken, ist es aus.“", "wert": 0, "tendenz": "katastrophe" }
      ] }
  ],
  "selbstbild": [
    "Ich weiß, was in meinem Körper passiert, wenn ich aufgeregt bin.",
    "Ich habe einen festen Ablauf für die letzte Minute.",
    "Wenn es mich mittendrin erwischt, weiß ich, was ich tue."
  ],
  "verhalten": [
    "Wie oft hast du in den letzten zwei Wochen vor einem aufregenden Moment bewusst ein Werkzeug eingesetzt?",
    "Wie oft hast du dich in den letzten zwei Wochen zu Wort gemeldet, obwohl du aufgeregt warst?"
  ]
}
```

## 15. Muster: Kompass – Ziel-Pyramide

| Ebene | Beispiel |
|---|---|
| Lebensziel | „Ich will vor Menschen sprechen können, ohne mich zu verstecken.“ |
| in drei Jahren | „Ich leite regelmäßig eine Besprechung und halte einmal im Jahr einen Vortrag.“ |
| in 90 Tagen | „Ich habe mich in jeder Teamrunde mindestens einmal zu Wort gemeldet.“ |
| diese Woche | „In der Runde am Mittwoch stelle ich eine Frage.“ |
| heute, zwei Minuten | „Ich schreibe die Frage für Mittwoch auf.“ |

Prüffragen: Will ich das – oder soll ich? Ist es als Hin-zu formuliert? Liegt der nächste Schritt in meiner Hand?

## 16. Prüfliste je Einheit

Vor der Übergabe an Davide gehst du jede Einheit durch:

1. Ein einziger Gedanke – und der steht im Aha?
2. Erster Schritt weckt Neugier, letzter führt nach draußen (oder endet bewusst ohne Mission)?
3. Mindestens drei Formate, mindestens zwei aktive?
4. Genau eine beste Antwort, und jede Begründung lehrt etwas?
5. Beleg-Stufe ehrlich, Zahlen mit Quelle, Hinweis bei B, D, U?
6. Alles selbst formuliert, Stammbesetzung, keine echten Personen und Marken?
7. Längen eingehalten, Du-Form, keine verbotenen Wörter?
8. Laute Übung mit stiller Ersatzübung?
9. Sonderregeln des Bereichs erfüllt (Abschnitt 3)?
10. Würdest du die Einheit einem Freund empfehlen – oder ist sie nur richtig?

## 17. Muster-Einheit: `ueberzeugen-1-03`

```json
{
  "id": "ueberzeugen-1-03",
  "bereich": "ueberzeugen",
  "stufe": 1,
  "nr": 3,
  "titel": "Nutzen statt Merkmale",
  "faehigkeiten": ["ueberzeugen.nutzen"],
  "dauerMin": 6,
  "beleg": "P",
  "belegHinweis": "Die Nutzen-Argumentation ist bewährtes Praxiswissen aus dem Verkauf. Gut belegt ist das Umfeld: Wer zuhört und sein Vorgehen an das Gegenüber anpasst, verkauft besser.",
  "quellen": ["franke2006", "itani2019"],
  "aha": "Niemand will eine Funktion. Jeder will, was sie für ihn tut. Die Brücke heißt: „… das heißt für dich …“",
  "schritte": [
    { "art": "vergleich",
      "lage": "Nadine Köhler fragt, was die neue Datensicherung bringt.",
      "schwach": "„Sie sichert stündlich, verschlüsselt und an zwei Standorten.“",
      "stark": "„Wenn morgen ein Rechner ausfällt, arbeitet ihr nach einer Stunde weiter – mit dem Stand von heute.“",
      "frage": "Welche Antwort würde sie weitererzählen?",
      "unterschied": "Die erste beschreibt das Gerät, die zweite ihren Montagmorgen. Merkmale informieren, Nutzen überzeugt." },
    { "art": "karte", "text": "Ein Merkmal sagt, was etwas ist. Ein Nutzen sagt, was der andere davon hat. Dazwischen liegt eine Brücke aus vier Wörtern: „… das heißt für dich …“ Sie zwingt dich, die Sache vom Gegenüber aus zu sehen – und zeigt dir sofort, ob du sein Problem verstanden hast." },
    { "art": "zuordnen",
      "kopf": { "id": "ueberzeugen-1-03-a", "faehigkeit": "ueberzeugen.nutzen", "stufe": 2, "kanal": "wissen" },
      "auftrag": "Merkmal oder Nutzen?",
      "faecher": ["Merkmal", "Nutzen"],
      "karten": [
        { "text": "Das Gerät wiegt 900 Gramm.", "fach": 0 },
        { "text": "Du trägst es den ganzen Tag, ohne es zu merken.", "fach": 1 },
        { "text": "Wir sind seit zwölf Jahren am Markt.", "fach": 0 },
        { "text": "Du hast in fünf Jahren noch denselben Ansprechpartner.", "fach": 1 },
        { "text": "Der Kurs hat acht Abende.", "fach": 0 },
        { "text": "Nach acht Abenden kannst du im Urlaub ein Essen bestellen.", "fach": 1 }
      ] },
    { "art": "umformulieren",
      "kopf": { "id": "ueberzeugen-1-03-b", "faehigkeit": "ueberzeugen.nutzen", "stufe": 3, "kanal": "koennen" },
      "auftrag": "Bau die Brücke: Mach aus dem Merkmal einen Nutzen für eine Handwerksmeisterin mit sechs Leuten.",
      "vorlage": "„Unsere Software hat eine automatische Terminerinnerung.“",
      "kriterien": ["nennt eine Folge für ihren Alltag", "spricht sie direkt an", "bleibt wahr"],
      "muster": [
        "„Deine Kunden bekommen am Vortag eine Nachricht – das heißt für dich: weniger Fahrten vor verschlossene Türen.“",
        "„Die Erinnerung geht von allein raus. Das heißt für dich: Niemand im Büro muss abends noch telefonieren.“"
      ] },
    { "art": "auswahl",
      "kopf": { "id": "ueberzeugen-1-03-c", "faehigkeit": "ueberzeugen.nutzen", "stufe": 3, "kanal": "wissen" },
      "frage": "Du weißt noch nicht, was deinem Gegenüber wichtig ist. Was tust du?",
      "antworten": [
        { "text": "Erst fragen: „Was soll danach leichter sein als heute?“", "wert": 2, "warum": "Ohne sein Problem zu kennen, ist jeder Nutzen geraten." },
        { "text": "Die drei beliebtesten Vorteile nennen.", "wert": 1, "warum": "Besser als Merkmale – trifft aber nur zufällig." },
        { "text": "Alle Funktionen der Reihe nach erklären.", "wert": 0, "tendenz": "merkmale", "warum": "Viel Information, kein Grund zu entscheiden." },
        { "text": "Gleich den Preis nennen, damit es schnell geht.", "wert": 0, "tendenz": "zufrueh", "warum": "Ein Preis ohne erkannten Nutzen ist immer zu hoch." }
      ] },
    { "art": "mission", "ref": "ueberzeugen-leiter-04" }
  ],
  "regel": "Sag nicht, was es ist. Sag, was der andere davon hat.",
  "merkkarten": [
    { "frage": "Wie heißt die Brücke vom Merkmal zum Nutzen?", "antwort": "„… das heißt für dich …“" },
    { "frage": "Was kommt vor jedem Nutzen-Satz?", "antwort": "Die Frage, was der andere braucht." }
  ],
  "mission": "ueberzeugen-leiter-04"
}
```
