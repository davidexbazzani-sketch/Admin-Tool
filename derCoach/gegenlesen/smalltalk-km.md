# Gegenlesen: Bereich `smalltalk`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiges Gegenlesen (Kommunikationstrainerin, stiller Nutzer, Faktenprüfung) · **Inhaltsdateien:** nicht geändert

## Was geprüft wurde

- **Maßstab:** `derCoach/08_ENTSCHEIDUNGEN.md`, `06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (ab 3a), `besetzung.json`, `inhaltTypen.ts`, das Gegenlesen der Phase 1 (`gegenlesen/smalltalk.md`).
- **Gelesen:** alles Neue in `src/coach/inhalt/smalltalk/`, nämlich `einheiten-2.json` (6 Einheiten), `einheiten-3.json` (5), `lagen-2.json` und `lagen-3.json` (10 Lagen, jeder Weg bis zu jedem Ende), `vorrat-03.json` (v-0099–0178) und `vorrat-04.json` (v-0179–0257), außerdem die k/m-Lerntage in `kurs.json`, `fc-025`–`fc-040`, die neuen Einträge in `wissen.json` (w-018, w-019, w-044–049, w-089, w-095, w-124, w-125) und 10 neue Quellen. Die Felder `"bild"` in `vorrat-01/02` habe ich wie verlangt nicht bewertet.
- **Figurenabgleich:** Ich habe alle Bereiche unter `src/coach/inhalt/` per grep nach Carla, Frau Sommer, Sven, Lena, Tarek, Jule, Miriam, Dr. Albers, Herrn Petersen, Jonas und Nadine Köhler durchsucht.
- **Technik:** `node scripts/coach-pruefe.mjs --nur smalltalk` meldet **0 Fehler, 0 Hinweise**. Mit `--soll smalltalk` kommen 14 Hinweise dazu: Wahlen in Lagen mit mehr als 140 Zeichen. Zusätzlich habe ich mit einem eigenen Zählskript die Antwortsätze ausgewertet. Die Reihenfolge spielt keine Rolle, weil `Wahl.tsx` und `Gespraech.tsx` mischen. Zur Länge, gezählt nur bei Sätzen mit mindestens drei Antworten:

| Datei | Sätze | beste = längste | falsche = längste |
|---|---|---|---|
| `lagen-2` | 19 | 9 | 8 |
| `lagen-3` | 20 | 10 | 5 |
| `vorrat-03` | 43 | 18 | 17 |
| `vorrat-04` | 44 | 19 | 15 |
| Tests fc-025–040 | 16 | 7 | 6 |

  Das Ratemuster aus Phase 1 (die falsche Antwort ist fast immer die längste) ist damit behoben.
- **An der Quelle nachgeschlagen:**
  - **Tamir & Mitchell 2012** (Volltext PMC): 17 % bzw. etwa 25 % Verzicht, n = 37 bzw. 41, und mehr Verzicht beim Teilen (Studie 4). ✓
  - **Koudenburg u. a. 2011** (Pressemitteilung Groningen): Video von 6 Minuten, 4 Sekunden Pause, „viewers were not aware“, 102 Studierende im Text-Versuch. ✓
  - **Liu u. a. 2023:** über 5.900 Teilnehmende. Bei Überraschung und bei schwachen Bindungen wird die Freude stärker unterschätzt (APA-Pressemitteilung und Berichte). ✓
  - **Levin u. a. 2011:** Alte Kontakte brachten *neuere* Einsichten und waren mindestens so wertvoll wie aktuelle. ✓ Die Formulierung ist aber missverständlich, siehe K2.
  - **Dunbar u. a. 1995:** Die Grenze von etwa vier stimmt ✓. Beobachtet wurde in Mensen, auf Empfängen und bei einer Feueralarm-Übung, „Plätze“ ist ungenau (K1).
  - **Bruk u. a. 2018:** **sieben** Studien, nicht sechs (S5).
- **Einfluss-Klassen:** Aushorchen ist `rot` und kommt nur als `kunstgriff` (3-04-b), `auswahl` (v-0249), Test (fc-039) und Wissen mit `preis`/`abwehr` (w-049) vor. Es gibt keine Einsatz-Übung, Musterlösung oder Mission dazu. ✓ Taktik-Missionen gibt es keine. ✓ Auch Rufnummern und Fachhilfe außerhalb des Schritts `fachhilfe` kommen nicht vor. ✓ Jede laute Übung hat eine stille Ersatzübung derselben Fähigkeit: 2-03-b → v-0099, v-0103 → v-0100, v-0104 → v-0099, v-0105 → v-0101. ✓

## Gesamteindruck

Fachlich und didaktisch ist der Teil stark. Er baut die Fähigkeiten aus Phase 1 aus, ohne sie zu doppeln: Namen werden um den eigenen Namen und die Notiz ergänzt, Stille wird in leere und volle Stille geteilt, auf Gable folgen gute Nachrichten, dazu kommen Gastgeber sein, Smalltalk nach oben und Aushorchen. Die Beleg-Stufen sind ehrlich. Die neuen Quellen sind sauber vermerkt, die meisten mit dem Zusatz „nicht am Volltext“. Die Rückmeldungen erklären fast immer etwas. Gut gelungen sind die Figurenbögen:
- Jule: Prüfung → Café
- Tarek: Schwester zieht in die Türkei
- Nadine Köhler: Treppe → Vater
- Lena: Laufgruppe → mit Miriam laufen

Das Schwächste ist wie in Phase 1 die **Logik der Wege in den Lagen**. Mehrere Knoten antworten auf eine Wahl, die man auf diesem Weg gar nicht getroffen hat. Mehrere Fazits loben etwas, das auf dem Weg dorthin nicht passiert ist, und das betrifft auch beide Sparrings. Dazu kommen **Widersprüche in den Figuren über die Bereiche hinweg**: Frau Sommers Mann, Miriams Alter, Svens Kündigung. Außerdem steht zweimal die Marke „Excel“ im Text.

**Zahl der Befunde:** muss 8 · sollte 11 · kann 16

---

## MUSS

### M1 – Marke „Excel“ (Regel: keine Marken)
| Datei | Kennung | Zitat | Ersatz |
|---|---|---|---|
| `lagen-3.json` | `smalltalk-l-13`, k3, Wahl 1 (Wert 2) | „weniger Excel-Listen zwischen Einkauf und Lager“ | „weniger doppelte Listen zwischen Einkauf und Lager“ (so steht es schon in v-0239) |
| `vorrat-03.json` | `smalltalk-v-0125`, Antwort mit Wert 2 | „Mein Chef meint, Excel-Formeln machen glücklich – dich auch?“ | „Mein Chef meint, Tabellen-Formeln machen glücklich – dich auch?“ |

### M2 – Frau Sommer ist Witwe, aber v-0120 fragt nach ihrem Mann
`vorrat-03.json`, `smalltalk-v-0120`: „Frau Sommer erwähnt im Treppenhaus ihren Mann … „Wie geht es denn Ihrem Mann?““. Das widerspricht `vorrat-02.json` `smalltalk-v-0060` im selben Bereich: „Frau Sommer: „Mein Mann hätte heute Geburtstag gehabt.““
**Ersatz:**
- Frage: „Frau Sommer erwähnt im Treppenhaus ihre Tochter, die du einmal bei ihr getroffen hast. Ihren Vornamen weißt du nicht mehr. Wie fragst du?“
- Wert 1: „„Wie geht es denn Ihrer Tochter?“ – ohne Namen, das fällt nicht auf.“
- Wert 2: „„Wie geht's ihr denn? Und helfen Sie mir – wie war ihr Vorname noch? Ich will ihn mir diesmal merken.““
- Die Begründungen können bleiben. Zur Tochter passen auch `gespraech` („Meine Tochter zieht nach Hamburg“) und `smalltalk-l-04` („Meine Tochter … bekommt ein Kind“).

### M3 – Miriam ist „Anfang 30“, in v-0187 aber 41
`vorrat-04.json`, `smalltalk-v-0187`: „Miriam: „Ich hab mit einundvierzig den Führerschein gemacht!““ und die Karte „Mit einundvierzig? Ist das nicht ein bisschen spät?“. In `08_ENTSCHEIDUNGEN.md` ist das Aussehen festgelegt: Miriam ist Anfang 30, so steht es auch im Szenenbild.
**Ersatz:** Auftrag: „Miriam: „Ich hab mit zweiunddreißig endlich den Führerschein gemacht!““. Karte (Fach 2): „„Mit zweiunddreißig? Ist das nicht ein bisschen spät?““

### M4 – Sven: zwei Kündigungen, die sich ausschließen
`vorrat-04.json`, `smalltalk-v-0184`: „Ich hab gekündigt. Nach zehn Jahren.“ In `ausdruck/lagen-3.json` `ausdruck-l-13` steht dagegen: „Bin heute gekündigt worden. Nach zwölf Jahren.“ In `lesen/lagen-1.json` ist er außerdem gerade Abteilungsleiter geworden. Beide Phase-m-Texte erzählen dasselbe Lebensereignis von Sven widersprüchlich.
**Ersatz** (die Figur wird namenlos, die Übung bleibt gleich): `"von": "ein alter Schulfreund"`. Die Aussage bleibt.

### M5 – `smalltalk-l-06`: k3 und ende3 passen nur zu einem der zwei Wege
Der Weg k1 (Wert 2) → k2 setzt fest: „Satz fertig, Kopf frei. Jetzt hörst du die Namen – auch den direkt vor dir.“ In k2 „nennt [er] seinen Namen“. Trotzdem kommen beide Wege in k3 an:
- k3, Wert 2: „Ich war vorhin so mit meinem Satz beschäftigt – wie war noch mal dein Name?“
- k3, Wert 1: „den Namen lieber nicht ansprechen, das wäre jetzt peinlich“
- ende3: „Den Namen von Platz fünf weißt du nicht“

**Ersatz:** Ein eigener Knoten `k3a` für die Wege aus k2. Alle drei Wahlen in k2 führen dann zu `k3a`:
```json
{ "id": "k3a", "sagt": "Pause, Kaffee im Flur. Der Mann mit der alten Kamera – seinen Namen hast du dir gemerkt – steht allein am Fenster und dreht an einem Rädchen.",
  "wahl": [
    { "text": "Hingehen, ihn mit Namen ansprechen: „Die Kamera vom Großvater – was ist das für eine?“", "wert": 2, "weiter": "k4", "rueck": "Name benutzt – das erste Abrufen – und gleich den Aufhänger aufgegriffen." },
    { "text": "Hingehen: „Spannende Kamera! Was ist das für eine?“", "wert": 1, "weiter": "k4", "rueck": "Ein guter Aufhänger. Mit seinem Namen wäre es zugleich ein Abruf gewesen." },
    { "text": "Am Kaffeeautomaten bleiben – er sieht beschäftigt aus.", "wert": 0, "tendenz": "vermeiden", "weiter": "ende3", "rueck": "Er steht allein und dreht an einem Rädchen – eher eine Einladung als eine Absage." } ] }
```
In `k4` muss dann „Er lacht und sagt seinen Namen noch einmal.“ heißen: „Er lacht.“ ende3 ändern zu: „Die Pause ist vorbei. Er sitzt wieder neben dir – gesprochen habt ihr nicht.“

### M6 – `smalltalk-l-07`: k2 und k3 antworten auf Sätze, die nicht gefallen sind
- **k2** („Die Frau lacht: „Zu wenig Sonne, wette ich.“ … „Und woher kennst du Jule?““) passt nur zum Weg k1/Wert 2 mit den Tomaten auf dem Balkon. Auf dem Weg k1b/Wert 2 hast du nichts über Tomaten gesagt und schon „aus ihrem Kochkurs“ erwähnt. Auf dem Weg k2b/Wert 2 („weiterziehen“) fällt ebenfalls kein Wort über Tomaten.
  - **Ersatz** k2 `sagt`: „Die beiden rücken zur Seite. Die Frau lacht: „Tomaten sind hier gerade das große Thema.“ Der Mann dreht sich ganz zu dir: „Und woher kennst du Jule?““
  - **Ersatz** k1b, Wert 2: „„Hallo, Jule schickt mich – ihr seid die Nachbarn? Ich bin {name}.““
- **k3b → k3:** In k3b, Wert 2, sagst du: „hab ich am ersten Abend die Suppe **versalzen**“. Darauf antwortet k3: „Zucker statt Salz!“
  - **Ersatz** k3b, Wert 2: „Nachlegen: „Ehrlich gesagt hab ich am ersten Abend Zucker statt Salz in die Suppe getan – Jule hat sie gerettet. Und ihr wohnt nebenan?““

### M7 – `smalltalk-l-13`: zwei Knoten antworten auf Fragen, die nicht gestellt wurden
- **k1, Wert 1** („Das Radio etwas lauter drehen.“) → k2: „„Früher jede Woche. Ich bin hier in der Nähe aufgewachsen.““ Das antwortet auf „Fahren Sie die Strecke öfter?“, eine Frage, die auf diesem Weg nicht gestellt wurde.
  - **Ersatz** k2 `sagt`: „Dr. Albers zeigt nach draußen: „Die Strecke bin ich früher jede Woche gefahren – ich bin hier in der Nähe aufgewachsen.“ Er zeigt auf einen Hof. „Da hab ich als Schüler in den Ferien Erdbeeren gepflückt.““
- **k2, Wert 1** („Wohnen Ihre Eltern noch hier …?“) → k3: „„Ein gebrauchtes Mofa. Es lief genau einen Sommer.““ Das antwortet auf die Geldfrage aus Wert 2.
  - **Ersatz** k3 `sagt`: „Er lacht: „Vom Erdbeergeld hab ich mir damals ein gebrauchtes Mofa gekauft. Es lief genau einen Sommer.“ Dann: „Und Sie? Wie gefällt es Ihnen eigentlich bei uns?““
- **k4, Wert 1** („Nicken und den Termin vorbereiten.“) → ende1: „„Schicken Sie mir das.““ Auf diesem Weg wurde nichts angeboten.
  - **Ersatz:** ein neues Ende `ende4` mit `"sagt": "Beim Aussteigen sagt Dr. Albers: „Danke für die Fahrt. Ich hatte die Erdbeerfelder ganz vergessen.“"` und `"ende": "Stille ausgehalten, echte Fragen, ehrlich geantwortet. Als er die Listen selbst ansprach, hätte eine kurze Frage die offene Tür genutzt."`. k4, Wert 1, führt dann nach `ende4`.

### M8 – Die Fazits der Sparrings loben, was auf vielen Wegen nicht geschah
- **`smalltalk-l-10`, ende1:** Es wird allein über k5/Wert 2 erreicht, egal was vorher passiert ist. Der Text sagt trotzdem: „Satz vorher fertig, Namen behalten, … die Stille mit dem Faden nach hinten gefüllt, aus der großen Runde eine kleine gemacht …“ und „beim Abschied kennst du alle Namen“. Das stimmt auch auf diesem Weg: k1 Wert 0 → k2b Wert 0 („den Rest des Abends seinen Namen umgehen“) → k3 Wert 0 (Handy) → k4b Wert 1 → k5 Wert 2.
- **`smalltalk-l-15`, ende1:** „Den vergessenen Namen ehrlich geholt, den Angeber gewürdigt, ohne mitzuspielen …“ steht auch auf den Wegen über k1b (Name geraten) und k2b (Angeber nie getroffen). Hinzu kommt: Auf dem Weg k1 → k2b → k3 heißt es in k4 „die Hebamme“, obwohl man nie erfahren hat, dass die Frau Hebamme ist.

**Ersatz:**
- l-10, ende1: `"sagt": "Renate lacht schallend über deine zwei Meter. Später tanzt du mit dem halben Tisch sieben."`, `"ende": "Zum Schluss angeknüpft: eine Mini-Geschichte und eine Frage zurück. Wie der ganze Abend lief, zeigen deine Wahlen davor – Satz vorher fertig, Namen behalten, ein Faden für die Stille, eine kleine Runde für Persönliches."`
- l-15, ende1: `"ende": "Mit Ausblick gegangen – und dann wirklich geschrieben. Davor zählten: vergessene Namen ehrlich holen, Angeber würdigen, ohne mitzuspielen, eine leise Geschichte mit Takt hören, zwei Menschen verbinden. So sieht Meisterschaft im Smalltalk aus."`
- l-15, k4 `sagt`: „… Am Nebentisch hörst du die Frau vom Anfang des Abends – sie ist Hebamme geworden – sagen, dass sie einen Garten geerbt hat und keine Ahnung davon hat.“

---

## SOLLTE

### S1 – Zählfehler in Szenen, deren Lehre gerade die Zahl ist
- **`einheiten-2.json`, `smalltalk-2-02-a`:** „Um einen Stehtisch stehen sechs Leute. Links hören vier Tarek zu … Rechts unterhalten sich zwei“. Das sind 4 + Tarek + 2 = 7. Die Rückmeldung zu Wert 1 sagt „Dort bist du aber der Fünfte“, man wäre aber der Sechste. **Ersatz:** „Links hören drei Tarek zu“. Dann sind es 6, und man ist der Fünfte.
- **`lagen-2.json`, `smalltalk-l-07`, k4:** „Drei weitere Gäste stellen sich dazu … Jetzt seid ihr sieben“. Das sind 3 + 3 = 6. **Ersatz:** „Vier weitere Gäste stellen sich dazu, darunter Jule mit einer Platte.“

### S2 – Ende und Folge-Knoten passen nicht zu jedem Weg (die übrigen Lagen und Dialoge)
| Datei | Kennung | Problem | Ersatz |
|---|---|---|---|
| `einheiten-2.json` | `2-02-c`, ende1 | Auf dem Weg k2/Wert 1 („erzähl, wie läuft das Training?“) antwortet Miriam: „Ich schreib dich auf die Liste. Kuchen bringst du mit.“ | `sagt`: „Miriam lacht: „Dich krieg ich noch auf die Liste – spätestens mit Kuchen.“ Ihr redet bis halb eins.“ |
| `einheiten-3.json` | `3-04-d`, ende2 | Es wird auch über k1/Wert 2 → k2/Wert 1 erreicht, also mit früher Unterbrechung. Trotzdem steht dort: „Deine Kundin wartet schon kurz“ und „Eine frühe, sanfte Unterbrechung hätten dir ein paar Minuten geschenkt.“ (außerdem Grammatik: „hätten“) | `sagt`: „Er nickt und geht zurück an seinen Stand.“ · `ende`: „Am Ende freundlich gelöst. Je früher und klarer du sanft unterbrichst – und Internes intern lässt –, desto leichter wird der Abschied.“ |
| `lagen-2.json` | `l-06`, ende2 | Auch über k4b erreicht: Dort gibt es keine dritte Person. „Wer neugierig neben euch steht …“ | ende2 aufteilen. Für k4b ein neues `ende5` mit „Den Namen spät, aber ehrlich geholt – nächste Woche kannst du ihn damit begrüßen. Früher gefragt, ist die Frage noch kleiner.“ |
| `lagen-2.json` | `l-06`, ende1 | „Satz vorher fertig“ steht auch auf dem Weg k1/Wert 0 → k2b | „Name mit Bezug, verpassten Namen geholt oder benutzt und eine dritte Person hereingeholt. So wird aus einer Vorstellungsrunde ein Anfang.“ |
| `lagen-2.json` | `l-07`, ende1 | „ihre Geschichte gelassen“ steht auch auf dem Weg k3/Wert 0 (übertrumpft) | „Eine offene Runde gefunden, eine Mini-Geschichte erzählt, den Ball zurückgegeben – und als es zu groß wurde, eine kleine Runde gebildet.“ |
| `lagen-2.json` | `l-09`, ende1 | „ganz ohne Verkauf“ steht auch auf dem Weg k2/Wert 0 (verkaufen) → k2b → k3 | „… und wieder eine Stufe tiefer gegangen. So wird aus einer Begegnung eine Beziehung.“ |
| `lagen-2.json` | `l-09`, ende2 | Auch über k3/Wert 0 erreicht: Dort wurde der Faden früh genutzt. Trotzdem: „je früher du ihn nutzt …“ | „Ein freundliches Wiedersehen. Euer Faden von damals trug – und leise Aufhänger wie der Vater lohnen ein zweites Hinhören.“ |
| `lagen-3.json` | `l-11`, ende1 | „Ohne Haken mitgefreut, den Zweifel gehört“ steht auch auf den Wegen k1/Wert 0 → k1b und k2/Wert 0 | „Die Freude groß gemacht, nach ihrem Zweifel gefragt und selbst eine kleine Panne gezeigt. So wird aus einer Neuigkeit Nähe – und Carla hat jetzt jemanden, dem sie vorher vortragen kann.“ |
| `lagen-3.json` | `l-12`, k2 | Auf dem Weg k2b/Wert 0 („ihr versteht euch ja prächtig“) antwortet Sven: „Apfelkuchen? Dann bleibe ich bis zum Schluss.“ | „Sven schnuppert: „Riecht nach Apfelkuchen. Dann bleibe ich bis zum Schluss.“ …“ |
| `lagen-3.json` | `l-12`, k3 | Auf dem Weg k2/Wert 1 („Dich neben Lena stellen“) heißt es: „Auf dem Balkon reden Lena und Frau Sommer über Basilikum.“ | „Später haben Lena und Frau Sommer sich gefunden und reden über Basilikum. …“ |
| `lagen-3.json` | `l-12`, ende1 | k4/Wert 1 („Ihr zuwinken“) → „Frau Sommer drückt dir an der Tür die Hand“ und „einen guten Abgang geschenkt“ | `sagt`: „Frau Sommer verabschiedet sich: „…““ (ohne „an der Tür“). Im `ende` „einem Gast einen guten Abgang geschenkt“ ersetzen durch „Gäste gehen lassen“. |
| `lagen-3.json` | `l-14`, ende1 | k4/Wert 1 („ich muss mal“ – und nicht wiederkommen) → „Er nickt: „Viel Spaß!““ | k4/Wert 1 auf ein neues `ende4` lenken: „Er schaut dir kurz nach. Am Nachbartisch empfangen dich die Leute aus dem Laufkurs.“ / „Gegangen – gut. Mit einem Satz Würdigung und einem echten Grund wäre es ehrlicher und wärmer gewesen.“ |

### S3 – `smalltalk-l-11`, k3: Die Antwort passt nur zur Frage aus Wert 2
k3 `sagt`: „Carla atmet aus. „Dass ich vor denen ins Stocken komme …““ Das ist die Antwort auf „Was macht dir dabei am meisten Kopfzerbrechen?“ (k2/Wert 2). Auf den Wegen über Wert 0 und Wert 1 wurde so nicht gefragt.
**Ersatz:** „Carla atmet aus. „Ich hab Angst, dass ich vor denen ins Stocken komme und alle denken: Die war die falsche Wahl.“ Kurze Pause. „Hattest du so was auch schon mal?““

### S4 – Die Rückmeldung lobt „Name“, aber im Satz steht keiner
- `einheiten-3.json`, `3-04-d`, k1b/Wert 2: Die Rückmeldung sagt „Name, Grund, Ausblick“, der Satz lautet aber „Entschuldigung, da kommt meine Kundin …“. **Ersatz:** „Spät, aber freundlich: Entschuldigung, Grund, Ausblick.“
- `lagen-3.json`, `l-15`, k4/Wert 2: Die Rückmeldung sagt „Zwei Menschen mit Namen und gemeinsamem Aufhänger verbunden“. **Ersatz:** „Zwei Menschen mit einem gemeinsamen Aufhänger verbunden – Gastgeber im Kleinen.“
- `tests.json`, `fc-035`, Wert 2: Die Begründung sagt „Name, Bezug, gemeinsamer Aufhänger“, und der Satz enthält außerdem eine erfundene „alte Kamera“. **Ersatz** Antwort: „Mit der Kollegin zum Grill gehen und beide mit Namen vorstellen: „Ihr fotografiert beide gern – ihr solltet euch kennen.““

### S5 – Bruk u. a. 2018: sieben Studien, nicht sechs
`einheiten-2.json` `2-03` (belegHinweis), `einheiten-3.json` `3-01` (belegHinweis und `studie.aufbau`: „In sechs Studien …“). Die Quelle `bruk2018` (in `selbst/quellen.json`) verlinkt den BPS Research Digest, und dort steht: „conducted seven studies“. Die meisten Studien arbeiteten mit gedachten Szenen, nur eine mit einer echten Lage.
**Ersatz:**
- In beiden belegHinweisen „sechs Studien“ ersetzen durch „sieben Studien, meist mit gedachten Szenen“.
- In `3-01` `aufbau`: „In sieben Studien …“.
- In `3-01` `grenze` ergänzen: „Meist gedachte Szenen, vor allem mit Studierenden.“
- Hinweis an den Hauptstrang: In `selbst/quellen.json` beim Eintrag `bruk2018` „Sechs Studien“ → „Sieben Studien“.

### S6 – Gespräch im Aufzug widerspricht Phase 1
In Phase 1 heißt es: `smalltalk-w-113` „bei Gesprächen in Bahn oder Aufzug Zurückhaltung: Dort kann der andere nicht weg“. Und `smalltalk-v-0007` sortiert „jemand steht neben dir im Aufzug, die Tür ist gerade zu“ unter „lieber in Ruhe lassen“ ein. Neu ist `3-03-a`: Die beste Antwort ist dort, die Geschäftsführerin im Aufzug mit Namen und Frage anzusprechen. Die Begründung zu Wert 0 widerspricht dem selbst: „Sie kann nicht weg – das macht es unangenehm“. Dasselbe gilt für `v-0227` („Du stehst mit der Geschäftsführerin im Aufzug …“). Der Nutzer bekommt so zwei Botschaften.
**Ersatz:**
- `3-03-a` Frage: „Morgens wartest du vor dem Aufzug. Neben dir wartet die Geschäftsführerin, die du nur vom Sehen kennst. Was tust du?“ Die Wahl mit Wert 0 bekommt die Begründung: „Ein Flur ist kein Besprechungsraum – und gleich kommt der Aufzug.“
- `v-0227` Auftrag: „Du stehst mit der Geschäftsführerin an der Kaffeemaschine. …“, das zweite Muster dazu: „Guten Morgen – {name}, Einkauf. Die neue Maschine braucht auch erst mal Anlauf, oder?“

### S7 – `smalltalk-v-0194` (Jonas, Stottern): Ton gut, zwei Wörter ändern
Das Kriterium „gibt keine Ratschläge zum Sprechen“ ist richtig, ebenso „würdigt seine Offenheit“, und es gibt kein nachgeahmtes Stottern. Zwei Stellen geraten aber in die Nähe der Stottern-Regeln aus `06` §3 und `LIESMICH` §5 (keine Wörter mit „entspann…“, nichts in Richtung „flüssig“):
- Aussage: „Danach war alles viel **entspannter**.“
- Muster 2: „danach konnte das Gespräch **einfach laufen**“. Das lässt sich lesen als „danach sprach er flüssig“, also als ob der Gewinn der Offenheit flüssigeres Sprechen wäre.

**Ersatz:**
- Aussage: „„Ich hab beim Kundentermin heute gleich am Anfang gesagt, dass ich stottere. Danach ging es nur noch um die Sache.““
- Muster 2: „„Offen gesagt – und danach ging es nur noch um eure Sache. Stark.““
- Muster 1 bleibt.

Sonst gibt es in `smalltalk` keine Stelle mit „flüssig“, „langsamer“ oder „atme“ im Zusammenhang mit Jonas. v-0201 („etwas langsamer“) betrifft Herrn Petersens Gehör und ist dort richtig.

### S8 – `smalltalk-l-09`: „Stufe drei knarzt“ kennt nur, wer l-03 über ende1 beendet hat
Der Witz steht nur in `lagen-1.json` `l-03` ende1. In l-09 bauen aber zwei Wahlen mit Wert 2 darauf (k2: „Knarzt Stufe drei noch?“, k2b), und die Rückmeldung sagt „sogar mit ihrem Witz von damals“.
**Ersatz** Lage: „… Nadine Köhler, die Schreinerin, mit der du damals über ihre Treppe und ihren Vater gesprochen hast – „Er würde sagen: Stufe drei knarzt“, hatte sie gelacht. Sie sieht dich und zögert kurz.“

### S9 – Das Geschlecht des Nutzers wird festgelegt (`smalltalk-l-10`)
k1/Wert 2: „„Ich bin der Cousin-Teil der Familie““. Phase 1 hat Entsprechendes korrigiert („Tierärztin“, „Nachbarin“).
**Ersatz:** „Deinen Satz sofort festlegen – „Der Bräutigam ist mein Cousin“ – und dann den anderen zuhören.“ Gleich danach in k2: „„Und, woher kennt ihr euch – ihr seid verwandt, oder? Habt ihr viel zusammen erlebt?““; k2/Wert 1: „„Ja, schon. Wir sind verwandt.““

### S10 – `smalltalk-3-04`: Die Karte nennt vier Lagen, die Einheit übt nur drei
Karte: „Jemand übertrumpft jede Geschichte.“ Für den Übertrumpfer gibt es aber kein Fach in `3-04-a` und keine Übung. `l-14` behandelt ihn erst später.
**Ersatz** in `3-04-a`: ein viertes Fach „zum Übertrumpfer“ mit zwei Karten. Karte 1: „Kurz würdigen, deinen Moment trotzdem stehen lassen: „Respekt. Für mich war's ein großer Schritt.““ Karte 2: „Nicht mitbieten – mit einer Frage zu ihm weiter.“

### S11 – `smalltalk-v-0111`: Wert 1 für einen Rückzug
„Schweigen und dir merken, diese Geschichte nie mehr zu erzählen.“ bekommt Wert 1, obwohl es dieselbe Katastrophen-Haltung ist, die 2-03-c mit Wert 0 bewertet („Verstummen und dir … vornehmen, lieber nichts mehr zu erzählen“).
**Ersatz:** Wert 0, `"tendenz": "katastrophe"`. Neue Wert-1-Antwort: „Kurz lächeln und schweigen, bis jemand anderes etwas sagt.“ mit der Begründung: „Kein Drama – gut. Ein lockerer Satz und eine Frage hätten die Stille selbst aufgelöst.“

---

## KANN

| # | Datei / Kennung | Befund | Vorschlag |
|---|---|---|---|
| K1 | `2-02` Schätzfrage, `w-044` | „in Mensen und auf Plätzen“: Dunbar beobachtete in Mensen, auf Empfängen und bei einer Feueralarm-Übung | „in Mensen und auf Empfängen“ |
| K2 | `3-05` studie, `w-046`, Quelle `levin2011` | „teils sogar neuer“ liest sich wie „jüngere Kontakte“ | „und brachte oft sogar neuere Gesichtspunkte“ |
| K3 | `3-05` Karte, `w-046` belegHinweis | „flüchtige Kontakte … beim Stellenwechsel“: Laut `rajkumar2022` halfen mäßig schwache Kontakte am meisten, nicht die ganz flüchtigen | „lose Bekannte (nicht die ganz entfernten) bringen beim Stellenwechsel oft mehr als enge Freunde“ |
| K4 | `3-02-c` Wert 0, `3-02` Karte/m3, `l-12` k2 Wert 0 | „eine Stille vor sechs Leute“ und „Stille einbinden“ sind doppeldeutig, gerade neben der Einheit „Stille aushalten“ | „einen stillen Menschen“ / „stille Gäste einbinden“ |
| K5 | `l-12` einleitung, k3 Wert 0 | „Du bist der Gastgeber“, „jetzt fehlt der Gastgeber“ | „Du lädst ein – und deine Gäste kennen sich nicht.“ / „und jetzt fehlt das Geburtstagskind“ |
| K6 | `l-07` k2 Wert 0 | „Kurs bei der Volkshochschule, jeden Dienstag“. Anderswo: `lesen-1-07-b` (Donnerstag) und `gespraech` vorrat-03 („Kochabend im Gemeindehaus, jeden zweiten Donnerstag“) | Wochentag und Ort streichen: „„Aus dem Kochkurs, wir kochen da immer drei Gänge, letztes Mal italienisch, davor thailändisch, davor …““ |
| K7 | `l-11` k2, `v-0220`, `v-0228` | Die Firma hat einmal eine „Geschäftsführung“/„Geschäftsführerin“ (3-03-a, v-0221, v-0232, v-0247), einmal einen „Vorstand“ | einheitlich „Geschäftsführung“: „vor der ganzen Geschäftsführung vorstellen“, „ein Mitglied der Geschäftsführung“ |
| K8 | `v-0183` Muster 2 | „Zwischen zwei Zuhausen“ (kein üblicher Plural) | „Zwischen zwei Zuhause.“ oder „Halb hier, halb dort zu Hause.“ |
| K9 | `lagen-2/3` (14 Stellen, `--soll`) | Wahlen in Lagen über 140 Zeichen: l-06 k3/k4, l-07 k1/k2 (2×), l-08 k1b/k2, l-10 k2/k5, l-11 k3, l-12 k1, l-13 k4b, l-15 k4/k5 | jeweils einen Halbsatz streichen. Bei l-06 k3, Wert 1, z. B. „…, das wäre jetzt peinlich“ ohne Rest |
| K10 | `l-09`, `v-0215` gegen `gespraech` | In `gespraech` übergibt dir Dr. Albers das Projekt mit Frau Köhlers Betrieb, er kennt sie also. In `v-0215` stellst du die beiden einander vor, in `l-09` sucht sie nach deinem Namen | in `v-0215` statt Albers „eine Kollegin aus dem Vertrieb“, oder die Zeitfolge im Hauptstrang festlegen |
| K11 | `3-02` vergleich ↔ `l-12` k1 | Zweimal „Dein Geburtstag“ mit Frau Sommers Apfelkuchen als Aufhänger. `3-02-c` Wert 0 und `l-12` k2 Wert 0 sind fast wortgleich („erzähl doch mal allen, wie … dein neuer Job …“) | `3-02` vergleich: „Deine Einweihungsfeier. …“; in `l-12` k2 Wert 0 statt Job: „… erzähl doch mal allen von deinem Lauf!“ |
| K12 | `3-04-d` k2 | Die Frage eines Ausstellers „wer ist … für die Bestellsoftware zuständig? Wir hätten da was“ ist eher Akquise als Aushorchen. Die Wert-0-Rückmeldung „Namen und Durchwahlen gehören nicht an Fremde“ ist dafür sehr streng, und der Kunstgriff (rot) davor verwischt die Grenze | Rückmeldung Wert 0: „Für Verkaufsanfragen gibt es die allgemeine Adresse – Namen und Durchwahlen gibst du Fremden besser nicht.“ |
| K13 | `3-01-a`, Karte „„Oh, gut für dich.“ – und weiter in die Karte schauen“ | liegt zwischen „knapp“ und „lenkt ab“ (Gable: passiv-konstruktiv vs. passiv-destruktiv) | Karte kürzen auf „„Oh, gut für dich.““ |
| K14 | `2-05` studie, `grenze` | „ein kleiner Versuch“, obwohl `aufbau` zwei Versuche beschreibt | „zwei kleine Versuche“ |
| K15 | `v-0182` ↔ Phase 1 | v-0182 („Jetzt ist das Enkelkind da!“) passt zu `l-04` („Ich werde Oma! … Das erste Enkelkind?“). Phase 1 widerspricht sich aber schon selbst: In `1-04-b` zieht Frau Sommers Enkel nach Kanada, in `aussprache/lagen-l` geht ihr Enkel zur Logopädie | Altlast, keine Änderung an v-0182. Der Hauptstrang sollte festlegen, ob Frau Sommer schon Enkel hat (dann l-04 „noch ein Enkelkind!“) |
| K16 | Figurenbögen über die Bereiche | Carla: `l-11` (neues Werk, Projektleitung Umzug), `2-05-a` (Vater ins Pflegeheim), `selbst-fc-009` (Beförderung), `ausdruck-v-0217` („neue Stelle, Weg doppelt so lang“), `stimme-v-0233` („Abschied in die neue Abteilung“): **verträglich**, nur „Abteilung“ und „Werk“ weichen ab. Sven: `v-0216` („Svens neue Partnerin“) neben `aussprache-fc-036` („Svens Hochzeit“), das geht, wenn die Partnerin die Braut ist. `3-05` Muster („Hallo Sven! … lange nichts gehört“) passt schlecht zu Sven als engem Schulfreund in `l-12`/`l-15`. Lena, Tarek, Jule, Dr. Albers (Tochter, Hochzeitsrede, Kanada, Hausumbau, Cello), Herr Petersen (Witwer, neu in `l-08`, sonst nirgends berührt) und Jonas (Band, Saxofon): **keine Widersprüche** | `stimme-v-0233` „in die neue Abteilung“ → „ins neue Werk“ (Hinweis an den Hauptstrang). In `3-05` Muster 1 „Sven“ durch einen namenlosen „alten Kletterfreund“ ersetzen |

## Was gut ist (kurz)

- **Quellenarbeit:** Die neuen Quellen nennen Fundstelle, Prüfdatum und Prüftiefe („nicht am Volltext“), und die Beleg-Stufen passen. Tamir, Koudenburg, Liu und Hall sind richtig wiedergegeben.
- **Rote Linie Aushorchen:** konsequent nur zum Erkennen. `w-049` hat `preis` und `abwehr`, der Wechsel vom Kunstgriff zur echten Lage (`fc-039`, `v-0249`, `v-0254`) ist gut gestaffelt.
- **Grenzen in beide Richtungen:** Einem Fremden schuldest du keine Erklärung (`l-14` k3). Gegen Lästern hilft eine Brücke ohne Predigt (`v-0143`, `v-0236`). Bei einem betrunkenen Kollegen gilt: „Dein Unbehagen ist Grund genug“ (`v-0257`). Stille werden nie auf eine Bühne gestellt.
- **Didaktik:** Phase k baut auf Phase 1 auf, Phase m auf k. Die Tests fc-025–040 liegen in den richtigen Stufenbändern (k 4–7, m 7–9) und gleichen den Übungen weniger als in Phase 1.
- **Kursplan:** k hat 20 Lerntage (6 E, 6 Ü, 4 L, 3 A, 1 S), m hat 18 (5 E, 5 Ü, 4 L, 3 A, 1 S). Die Bänder `[3,6]`→`[4,7]` und `[5,8]`→`[6,10]` entsprechen `LIESMICH` 3a.

## Urteil

**Nach M1–M8 freigabereif.** M1 (Marke) und M2–M4 (Figuren) sind kleine Textänderungen. M5–M8 betreffen die Logik der Lagen. Dabei geht es vor allem um Fazits und Knoten, die nur auf einem Weg passen. Das ist dasselbe Muster wie in Phase 1. Ich empfehle, beim Schreiben jeden Knoten einmal gegen jede eingehende Wahl zu lesen.

---

## Umsetzung (25.11.2026)

Alle Änderungen nur in `src/coach/inhalt/smalltalk/`, Kennungen unverändert, nichts gelöscht. Danach `node scripts/coach-index.mjs`; `node scripts/coach-pruefe.mjs --nur smalltalk` meldet **0 Fehler, 0 Hinweise**, `--soll smalltalk` ist leer. Alle Wege der Lagen l-06 bis l-15 habe ich mit einem Wege-Skript aufgelistet (jeder Knoten erreichbar, kein toter Verweis) und jedes Ende gegen jeden eingehenden Weg gelesen.

### MUSS

| Befund | Stand | Anmerkung |
|---|---|---|
| M1 Excel | umgesetzt | l-13 „doppelte Listen“, v-0125 „Tabellen-Formeln“ |
| M2 Frau Sommers Mann | umgesetzt | v-0120 fragt nach der Tochter (Frage, beide Antworten, Vorname „ihr“) |
| M3 Miriam 41 | umgesetzt | v-0187 „mit zweiunddreißig endlich“, Karte angepasst |
| M4 Svens Kündigung | umgesetzt, **anders als vorgeschlagen** | Sven bleibt; die Aussage passt jetzt zu `ausdruck-l-13`: „Mir ist gekündigt worden. Nach zwölf Jahren. Alle sagen, das ist bestimmt eine Chance. Hoffentlich.“ Kriterien und Muster auf Schlag und leise Hoffnung umgestellt |
| M5 l-06 | umgesetzt | neuer Knoten `k3a` (alle Wege aus k2); k4 „Er lacht – seinen Namen hast du jetzt sicher.“ (passt auch zum Weg über k3, auf dem man nachgefragt hat); k4-Rückmeldung „jedes Abrufen festigt ihn“ statt „das zweite Abrufen“; ende3 neu; ende1 ohne „Satz vorher fertig“/„Name mit Bezug“ (stimmte auf den Wegen k2/Wert 0–1 nicht) |
| M6 l-07 | umgesetzt | k2 `sagt` und k1b/Wert 2 wie vorgeschlagen; k3b/Wert 2 mit „Zucker statt Salz“. **Zusätzlich:** „Und ihr wohnt nebenan?“ in k2/Wert 2 und k3b/Wert 2 ersetzt durch „Und ihr, seit wann kennt ihr sie?“ – dass die beiden Nachbarn sind, weiß man nur auf dem Weg über k1b |
| M7 l-13 | umgesetzt, erweitert | k2 und k3 wie vorgeschlagen (k3 beginnt mit „Er erzählt ein wenig von früher“, damit auch die Eltern-Frage eine Antwort bekommt); neues `ende4` für k4/Wert 1 mit Fazit ohne „Stille ausgehalten“ (stimmt auf den Wegen über k1/Wert 0–1 nicht). **Zusätzlich:** In k4 spricht Dr. Albers die doppelten Listen selbst an – sonst antwortet er auf dem Weg k3/Wert 1 („Gut, danke.“) auf Listen, die nie erwähnt wurden. ende1 wird auch über k4b erreicht und lobt jetzt nur „gefragt statt verkauft“ |
| M8 Sparring-Fazits | umgesetzt | l-10 ende1 und l-15 ende1 loben nur noch den letzten Zug und nennen die übrigen als Maßstab („Für den ganzen Abend zählen dieselben Züge …“). l-15 k4 erklärt „die Hebamme“. **Zusätzlich:** l-15 k5 und ende1 setzten voraus, dass Hebamme und Gärtner verbunden wurden (stimmt nicht nach k4/Wert 0) – beide jetzt wegunabhängig |

### SOLLTE

| Befund | Stand | Anmerkung |
|---|---|---|
| S1 Zählfehler | umgesetzt | 2-02-a „drei hören Tarek zu“; l-07 k4 „Vier weitere Gäste“ |
| S2 Enden je Weg | umgesetzt | 2-02-c ende1 (`sagt` wie vorgeschlagen, `ende` zusätzlich wegunabhängig – „Hingestellt“ stimmte auf dem Weg über „Worum geht's?“ nicht); 3-04-d ende2; l-06 `ende5`; l-07 ende1; l-09: statt Textänderung zwei neue Enden (`ende4` für k3/Wert 1, `ende5` für k3/Wert 0), weil der Vorschlag für ende1 („eine Stufe tiefer“) auf k3/Wert 1 und der für ende2 („Euer Faden trug“) auf k2b/Wert 1 nicht stimmte; l-11 ende1 eigener Text (der Vorschlag „nach ihrem Zweifel gefragt“ stimmte auf k2/Wert 0 nicht); l-12 k2, k3 wie vorgeschlagen, k4/Wert 1 → neues `ende4`, ende1 lobt nur den Abgang; l-14 `ende4` wie vorgeschlagen, ende1 lobt nur den Abgang |
| S3 l-11 k3 | umgesetzt | wie vorgeschlagen |
| S4 „Name“ ohne Namen | umgesetzt | 3-04-d k1b, l-15 k4, fc-035 (Antwort und Begründung) |
| S5 Bruk: sieben Studien | umgesetzt | an der Quelle bestätigt (BPS Research Digest, Psychology Today: sieben Studien, meist gedachte Szenen). 2-03 und 3-01 belegHinweis, 3-01 `aufbau` und `grenze`. `selbst/quellen.json` → Hauptstrang |
| S6 Aufzug | umgesetzt | 3-03-a: Warten vor dem Aufzug, „am Tag nach dem Sommerfest“ steht jetzt in der Frage (sonst behauptete die beste Antwort ein Sommerfest, das nicht im Text steht); Antworten „mitwarten“, „bis der Aufzug kommt“; v-0227 an der Kaffeemaschine, Kriterium „kein Verkauf zwischen Tür und Angel“ |
| S7 Jonas | umgesetzt | wie vorgeschlagen |
| S8 Stufe drei | umgesetzt | Lage von l-09 wie vorgeschlagen (Zitat stimmt wörtlich mit l-03 ende1 überein) |
| S9 Cousin | umgesetzt | k1, k2 `sagt`, k2/Wert 1. **Zusätzlich:** k4 „Der Mann, der vorhin direkt vor dir dran war“ – dass er mit dem Bräutigam studiert hat, erfährt man auf dem Weg über k2b nicht |
| S10 Übertrumpfer | umgesetzt | 3-04-a viertes Fach mit zwei Karten |
| S11 v-0111 | umgesetzt | Rückzug → Wert 0 `katastrophe`, neue Wert-1-Antwort |

### KANN

| Befund | Stand | Anmerkung |
|---|---|---|
| K1 Mensen/Empfänge | umgesetzt | 2-02, w-044 |
| K2 „neuer“ | umgesetzt | 3-05, w-046, `levin2011` |
| K3 lose Kontakte | umgesetzt | 3-05 Karte und belegHinweis, w-046 – mit „lockere“, weil „loser“ an der Wortliste des Prüfskripts hängen bleibt |
| K4 „Stille“ als Person | umgesetzt | 3-02-c, 3-02 Karte, 3-02-m3, l-12 k2 |
| K5 Gastgeber | umgesetzt | l-12 Einleitung („Du lädst ein …“; nennt jetzt „das Gehen leicht machen“ statt „dich selbst herausziehen“, das keine Wahl übte), k3/Wert 0 „Geburtstagskind“, k4 „Gastgeben“ |
| K6 Wochentag | umgesetzt | l-07 k2/Wert 0 |
| K7 Vorstand | umgesetzt | l-11, v-0220, v-0228 → Geschäftsführung. Der „Vorstand“ in l-14 und v-0200 ist der des Sportvereins und bleibt |
| K8 Zuhausen | umgesetzt | „Halb hier, halb dort zu Hause.“ |
| K9 Längen > 140 | umgesetzt | alle 14 Stellen gekürzt (in l-08 k2 dabei „leise“ gestrichen – bei einem schwerhörigen Gegenüber widersprüchlich). Danach war in `lagen-2` die beste Antwort 11 von 20 Mal die längste → zwei falsche Antworten verlängert (l-06 k3a, l-10 k1) |
| K10 Albers/Köhler | umgesetzt | v-0215 stellt jetzt Herrn Petersen (Kunde, richtet ein altes Haus her) und Frau Köhler einander vor |
| K11 zweimal Geburtstag | umgesetzt | 3-02 vergleich „Deine Einweihungsfeier“ (wie 3-02-c), l-12 k2/Wert 0 „von deiner Laufgruppe“ |
| K12 Akquise | umgesetzt | Rückmeldung wie vorgeschlagen |
| K13 Gable-Karte | umgesetzt | „„Oh, gut für dich.““ |
| K14 zwei Versuche | umgesetzt | |
| K15 Enkel | bewusst nicht | Altlast aus Phase 1, nur im Hauptstrang lösbar |
| K16 Figuren | teilweise | 3-05 Muster ohne „Sven“; `stimme-v-0233` → Hauptstrang |

### Weitere Korrekturen beim Durchgehen der Wege

- l-08 ende1 `sagt` nennt den Fisch jetzt so, dass es auch auf dem Weg über k3b passt (dort fiel der Fisch nie).
- l-12: Die besten Antworten behaupteten „Dein Lieblingskuchen!“ (k1), „Sven isst nichts lieber“ (k2b) und „Sie wollten doch die Kräuter sehen – Lena hat auch einen Kräutergarten“ (k2), ohne dass das im Text stand. Jetzt nennt die Lage Lenas Kräutergarten und k1 Frau Sommers Wunsch, die Kräuter zu sehen; k1/k2b stellen mit „hat Apfelkuchen mitgebracht/gebacken“ vor.
- l-15 k2b/Wert 2: „Ich will mich gleich ordentlich entschuldigen“ passte nicht zum Weg k1/Wert 1 (nichts falsch gemacht) → „wie heißt die Frau im blauen Kleid? Ich geh gleich noch mal zu ihr.“ (das blaue Kleid steht jetzt in k1).
- l-11 k2 nannte erst „das Gespräch mit der Geschäftsführung“ und gleich danach den Auftritt vor ihr → „Carla erzählt, wie sie es erfahren hat …“.

### Offen für den Hauptstrang (außerhalb von `smalltalk/`)

- `selbst/quellen.json`, `bruk2018`: „Sechs Studien“ → „Sieben Studien“ (bestätigt: BPS Research Digest und Psychology Today).
- `stimme-v-0233`: „Abschied in die neue Abteilung“ → „ins neue Werk“ (passt zu `smalltalk-l-11`).
- Frau Sommers Enkel (K15): festlegen, ob sie schon Enkel hat; dann `smalltalk-l-04` („Ich werde Oma! … Das erste Enkelkind?“) bzw. `1-04-b`/`aussprache` angleichen.
- Sven über die Bereiche: `selbst/lagen-1` (neues Haus, „nächsten Monat Abteilungsleiter“) steht neben `ausdruck-l-13` (nach zwölf Jahren gekündigt). In `smalltalk` passt v-0184 jetzt zu `ausdruck`; die Zeitfolge mit `selbst` muss der Hauptstrang festlegen.
