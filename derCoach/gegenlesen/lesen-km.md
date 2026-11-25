# Gegenlesen: Bereich `lesen`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser (Schreib-Zusammenhang unbekannt, nur Regeln und Quellen) · **Inhaltsdateien:** nicht geändert

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md`, `06_INHALT_REGELN_MUSTER.md` (§1–3, Prüfliste §16), `src/coach/inhalt/LIESMICH.md` (§3a–8), `05_LEHRPLAN.md` 3.10 (Titel k/m stimmen mit dem Lehrplan überein), `besetzung.json`, `inhaltTypen.ts`, `gegenlesen/lesen.md` (Phase 1).
- **Vollständig gelesen:** `einheiten-2.json` (2-01…2-06), `einheiten-3.json` (3-01…3-05), `lagen-2.json` (l-06…l-10), `lagen-3.json` (l-11…l-15) – bei allen Lagen **jeder Weg** bis zu jedem Ende verfolgt –, die 38 neuen Lerntage in `kurs.json`, `tests.json` fc-025…fc-040, die neuen bzw. geänderten Einträge in `wissen.json` (w-016…019, w-036…038, w-054, w-088, w-096, w-115, w-124, w-125) und die neun neuen Quellen in `quellen.json`.
- **Vorrat:** `vorrat-03.json` (84 Einträge, v-0086…v-0169) und `vorrat-04.json` (83 Einträge, v-0170…v-0252) **vollständig** gelesen, aufgeteilt auf zwei Gegenleser mit demselben Maßstab. Die Befunde stehen unten mit dem Kürzel [v03] bzw. [v04].
- **Quellen an der Quelle geprüft (Stichprobe):**
  - `hall2005`: bestätigt. Die Vorstellungen über Rang-Zeichen waren „stronger and much more prevalent“ als die tatsächlichen Zusammenhänge, die Befunde schwankten stark. Die Inhalte nennen **keine Einzelzahlen** – so soll es sein. Die Meta-Analyse betrifft Körpersprache (Gesicht, Blick, Abstand, Haltung, Berührung, Stimme), **nicht** Körpergröße oder Kleidung (siehe S13, K12).
  - `kassin2005`: Aufbau bestätigt (zehn Häftlinge, halb wahre, halb erfundene Geständnisse, Studierende gegen Ermittler, Video oder Ton). Bestätigt ist auch „Studierende eher genauer als Ermittler“ (Projektseite des Autors, Auszüge der Zusammenfassung). Den Vorsprung der Tonaufnahmen konnte ich nicht unabhängig bestätigen, der Volltext war maschinell nicht lesbar. Die Studie handelt vom **Erkennen falscher Geständnisse**, also von Glaubwürdigkeit. Zu `w-088` passt sie nur für den Teil „Ermittler selbstsicherer“, und das in **einer** Studie (siehe S12). In `2-02` (Stimme und Gefühle) rückt sie die Stimme gefährlich nah an „Lügen hören“ (siehe S11).
  - `depaulo1997`: Die Angaben (18 Stichproben, r = 0,04) decken sich mit meiner Kenntnis der Zusammenfassung. Über Fachleute gegenüber Laien sagt die Arbeit nichts; sie stützt deshalb nicht das „oft“ in `w-088`.
  - Fremde Quellen, die `lesen` nutzt: `koudenburg2011`, `boland2022`, `stivers2009`, `brennan1995`, `boothby2018`, `tenney2007`, `klofstad2012`, `clarkwells1995`. Die Einträge sind geprüft und decken die Aussagen. Ausnahme ist `klofstad2012` in `2-03` (siehe S13). `milton2012` (`geprueft: false`) wird in `3-04` nur als Denkmodell genannt, ohne Zahl – in Ordnung.
- **Technik:**
  - `node scripts/coach-pruefe.mjs --nur lesen`, erster Lauf: **0 Fehler, 0 Hinweise** (lesen; gesamt 2 Fehler in anderen Bereichen).
  - Zweiter Lauf: Abbruch, weil `flirten/wissen.json` gerade kein gültiges JSON ist (Zeile 29, „`] },, "art"`“). Das liegt nicht an `lesen`, vermutlich bearbeitet ein paralleler Agent die Datei. Ich melde es dem Hauptstrang.
  - Eigene Zählung des Vorrats je Übungstag: Jeder Übungstag ue-008…ue-018 ist mindestens doppelt gefüllt, auch leise. Kein Format fehlt.
  - Prüfskript-Lücke: Die Statistik „beste Antwort = längste“ zählt nur Schritte mit `antworten`. **Lagen (`wahl`) zählt sie gar nicht.** Tests zählt sie nur über die ganze Datei, sodass die neuen fc-025…040 im Schnitt mit Phase 1 untergehen. Einheiten-Dateien mit weniger als 10 Fragen prüft sie nie. LIESMICH §4 sagt dagegen „auch für Tests und Lagen“. Siehe S16/S17.

## Gesamteindruck

Fachlich bleibt der Bereich auf dem sauberen Niveau von Phase 1.

- **Lügen-Erkennung:** Nirgends wird sie als sicher dargestellt. „Sicherheit ist kein Beweis“ (3-05) ist ein starker, ehrlicher Abschluss.
- **Einzelzeichen:** Sie sind nie Beweis. „Erst die Lage, dann das Gesicht“ zieht sich durch alle k-Inhalte.
- **Kultur:** Der Bereich arbeitet vorbildlich ohne Klischee. `3-04-a` und `fc-037` werten das Kultur-Klischee ausdrücklich als falsch. In `l-14` ist die Mutter lebhaft und der Vater ruhig – „die Kultur“ erklärt also nichts.
- **Neurodivergenz:** Stottern (Jonas), Zweitsprache, Hörminderung, Schmerz, Medikamente und soziale Angst kommen als Gründe aus der Lage vor. Damit ist der offene Punkt 9 aus Phase 1 erledigt. Diagnosen aus dem Alltag sind durchgehend falsche Antworten.
- **Rote Linie:** Sie erscheint nur als `kunstgriff` mit Abwehr, ohne Einsatz und ohne Mission.
- **Rufnummern:** Es gibt keine. Die Fachhilfe kommt in k/m nicht vor und ist dort auch nicht nötig.

Die Schwächen liegen fast alle an **zwei bekannten Stellen**:

1. **Lagen-Enden, die auf schwachen Wegen loben oder Ereignisse nennen, die auf diesem Weg nie vorkamen.** Das betrifft sieben von zehn neuen Lagen. Es ist genau der wiederkehrende Fehler aus der Auftragsliste.
2. **Längen:** In den neuen Tests ist die beste Antwort 13 von 16-mal die längste, in den neuen Einheiten 11 von 14-mal. Das Prüfskript sieht das nicht.

Dazu kommen:

- eine Bühnen-Dublette (v-0089 ≈ 2-05-a),
- ein Formcheck-Test, dessen Frage die Lösung verrät (fc-027),
- eine Teilpunkte-Antwort, die den Mythos „Lügen am Gesicht erkennen“ belohnt (v-0210),
- einige Figuren- und Anrede-Brüche.

**Zahlen:** muss 10 · sollte 34 · kann 46.

---

## MUSS (10)

**M1 [v03] `vorrat-03.json` › `lesen-v-0089` (ganze Bühne)**
- Zitat: „Erzähl eine Minute von etwas, das dich gerade freut, und nimm dich dabei mit dem Handy auf. Schau die Aufnahme danach einmal ohne Ton an.“
- Begründung:
  - Das ist fast wortgleich mit `lesen-2-05-a`: gleicher Auftrag, 60 s, Publikum `video`, Ersatz `leise: lesen-v-0086`. Der Übungstag ue-012 direkt nach 2-05 wiederholt also die Einheit, statt aufzubauen.
  - Die Prüfliste verlangt „vorher in drei Wörtern notiert, wie du wirken willst“. Das steht im Auftrag von v-0089 gar nicht.
- Ersatz (Fähigkeit `lesen.eigen`, Stufe 5, `leise: lesen-v-0088`):
  - `auftrag`: „Erklär eine Minute lang einen Ablauf, den du gut kennst, und nimm dich mit dem Handy auf. Bau zwei Sätze ein, die sagen, was man nicht sieht – etwa: „Ich schaue ernst, weil ich mitdenke.“ Schau die Aufnahme danach ohne Ton an.“
  - `stoerungen`: [„Nach der Hälfte: Stell dir vor, jemand runzelt die Stirn – sag einen Satz, der dein Denkgesicht erklärt.“, „Kurz vor Schluss: Sag ausdrücklich, was dir an der Sache gefällt.“]
  - `pruefliste`: [„zwei Sätze eingebaut, die sagen, was man nicht sieht“, „die Aufnahme ohne Ton angesehen“, „verglichen: Wo wirkt das Gesicht strenger oder ruhiger, als du dich gefühlt hast?“, „die Sätze klangen kurz, nicht wie eine Entschuldigung“]

**M2 [v04] `vorrat-04.json` › `lesen-v-0210`, dritte Antwort (`wert: 1`)**
- Zitat: „Übertrieben – im Video sieht man Gesichter ja schlecht, vor Ort würde es besser funktionieren.“
- Begründung: Die Antwort gibt Teilpunkte für die Annahme, am Tisch ließen sich Lügen am Gesicht erkennen – also für genau den Mythos, den der Bereich abbaut. Dasselbe Muster wurde in Phase 1 bei v-0051 korrigiert.
- Ersatz:
  - text: „Übertrieben – „verblüffende Treffer“ sind nur Berichte, keine Prüfung.“
  - warum: „Richtig gezweifelt. Es fehlt der Kern: Auch am Tisch, ohne Video, erkennt man Lügen kaum besser als der Zufall.“

**M3 `lagen-2.json` › `lesen-l-07` › `ende1.ende`**
- Zitat: „Pause, „mhm“, „grundsätzlich“ – bei einer, die sonst sofort Feuer fängt. Gefragt statt überredet, kam das eigentliche Bedenken …“
- Begründung: `ende1` wird auch über k1 (wert 0, „Aufwendig, ja, aber das wird richtig toll!“) → k2b → k3 erreicht und über k1 (wert 1) → k2c → k3. Auf beiden Wegen sagt Jule nie „grundsätzlich“. Auf dem ersten Weg wurde sie sogar zuerst überredet. Das Fazit beschreibt also einen Weg, den der Nutzer nicht gegangen ist, und lobt dabei den schwachen.
- Ersatz: „Pause, „mhm“, ein Ja ohne Schwung – bei einer, die sonst sofort Feuer fängt. Als du nachgefragt hast, kam das eigentliche Bedenken: nicht die Arbeit, sondern dass niemand wegen des Geldes fehlt.“

**M4 `lagen-2.json` › `lesen-l-09` › `ende1.ende`**
- Zitat: „Du hast es gehört, statt das Ja beim Wort zu nehmen, und eine Lösung gefunden …“
- Begründung: Der Weg k1 wert 0 („Super, dann gebe ich es heute noch an den Kunden weiter …“, Tendenz `ueberhoeren`) → k2b → k3p → `ende1` nimmt das Ja gerade beim Wort. Erst Carlas Mail holt es zurück. Das Fazit lobt den schwachen Weg.
- Ersatz: „Carlas „grundsätzlich“ war ein Vorbehalt mit gutem Grund. Als du nachgefragt hast, kam er auf den Tisch – und eure Lösung nimmt ihn auf. Je früher du ein leises Aber einlädst, desto weniger muss nachgebessert werden. Und: Ein Stocken beim Sprechen ist kein Zögern.“

**M5 `lagen-2.json` › `lesen-l-10` (Sparring k) › `ende3.ende`**
- Zitat: „Fast. Du hast viel richtig gelesen. …“
- Begründung: Alle Runden führen unabhängig vom Wert weiter. `ende3` ist also auch nach lauter wert-0-Wahlen erreichbar – etwa „Sie ist skeptisch …“, „Sie haben hier wohl eigentlich das Sagen?“, „Sie in Ruhe lassen – sie ist offensichtlich nicht interessiert“. Dann stimmt „viel richtig gelesen“ nicht.
- Ersatz: „Am Ende hätte ein freundlicher Satz zu deiner Wirkung mehr gebracht als Schweigen oder eine Entschuldigung. Geh die fünf Runden noch einmal durch: Wo hast du zuerst die Lage gelesen, wo gleich gedeutet?“

**M6 `lagen-3.json` › `lesen-l-11` › `ende1.ende`**
- Zitat: „Statt Einzelne zu deuten, hast du die Runde geöffnet …“
- Begründung: `ende1` wird auch über k1 wert 0 („Sie scheinen ja ziemlich dagegen zu sein, so wie Sie dasitzen?“, Tendenz `einzelzeichen`) → k2c → k2 → k3 erreicht. Auf diesem Weg wurde ein Einzelner gedeutet, vor allen.
- Ersatz: „Das Muster war da: eine Stimme, die den Raum füllt, Handys, Flüstern, eine Frage, auf die alle nicken. Am Ende hat die Runde gesprochen, weil du sie geöffnet hast – und die Begeisterte hast du wieder eingebunden.“

**M7 `lagen-3.json` › `lesen-l-12` › `ende1.ende`**
- Zitat: „Online hast du mit dem Ohr gelesen und mit Namen gefragt. … und Bedenken kamen, weil du ihnen einen Weg gegeben hast.“
- Begründung: Über k2 wert 0 („Tarek gedanklich abhaken – Kamera aus …“, Tendenz `etikett`) oder wert 1 → k3b → wert 2 → `ende1` hat niemand Tarek mit Namen gefragt. Er meldet sich selbst aus dem Funkloch.
- Ersatz: „Online täuscht das Bild: Gleichzeitiges Reden war die Leitung, nicht Zögern; Kamera aus hieß Zug, nicht Desinteresse. Am Ende kam Tareks Frage auf den Tisch – am schnellsten dort, wo du mit Namen gefragt hast.“

**M8 `lagen-3.json` › `lesen-l-15` (Sparring m) › `ende1.ende`**
- Zitat: „Du hast das Muster gelesen statt jeden zu deuten, Stocken von Zögern unterschieden, Bedenken einen Weg gegeben und eine Vermutung lieber geprüft …“
- Begründung: Fast jede wert-0-Wahl führt über einen Korrekturknoten (k2b, k4b, k5b, k5c) zurück auf den Hauptweg. Ein Nutzer kann also Albers vor allen deuten, Jonas' Einwand übergehen und Tarek „genervt“ nennen und bekommt trotzdem dieses Lob.
- Ersatz: „Fünf Menschen, zwei davon online, wechselnde Signale. Am Ende lagen beide Bedenken auf dem Tisch, und die Rückmeldung zu deiner Wirkung hast du geprüft statt geglaubt. Schau zurück: Wo hast du gelesen und gefragt – und wo erst gedeutet und dann korrigiert? Dafür ist Menschenlesen da: besser verstehen, besser fragen.“

**M9 `lagen-3.json` › `lesen-l-15` › Knoten `k2`, zweite Wahl → `k4b`**
- Zitat (k4b): „Albers fragt: „Und das Netz in der Werkstatt?“ Stille. Jonas hat sich aus der Konferenz abgemeldet.“ und die beste Wahl „Stimmt, das habe ich übergangen.“
- Begründung: Auf dem Weg k2 → „Dann sind wohl alle einverstanden.“ → k4b hat Jonas das Netz nie erwähnt, denn k3 wird übersprungen. Albers fragt nach etwas, das niemand gesagt hat, und „übergangen“ stimmt nicht. Das ist ein Logikbruch.
- Ersatz: In k2 die zweite Wahl `"weiter": "k3"` statt `"k4b"` (rueck bleibt). Jonas meldet sich dann in Runde 3 von selbst. k4b bleibt über k3 wert 0 erreichbar und passt dort.

**M10 `tests.json` › `lesen-fc-027` › `frage`**
- Zitat: „… Wen fragst du nach **ihrer** Meinung zum Ausflug?“
- Begründung: Das Fürwort „ihrer“ verrät, dass eine Frau gemeint ist. Zur Wahl stehen ein Vater und eine Mutter. Die beste Antwort ist damit erratbar, und das in einem Formcheck.
- Ersatz: „Beim Elternrat redet ein Vater laut und lange. Bevor jemand auf eine Frage antwortet, schauen aber alle kurz zu einer Mutter, die bisher kaum etwas gesagt hat. Wessen Meinung zum Ausflug holst du zuerst ein?“

---

## SOLLTE (34)

### Lagen: Logik und Figuren

**S1 `lagen-2.json` › `lesen-l-06` › `titel`, `einleitung`**
- Zitat: „Der Kopfschmerztag“ / „Ein strenges Gesicht, das gar nicht dir gilt.“
- Begründung: Titel und Einleitung verraten die Auflösung, bevor die erste Wahl fällt. Die Lage prüft aber gerade, ob man die Lage selbst liest.
- Ersatz:
  - titel: „Das strenge Gesicht“
  - einleitung: „Ein strenges Gesicht, während du deinen Entwurf zeigst. Du übst, zuerst die Lage zu lesen, dann das Gesicht – und eine Deutung zurückzunehmen, bevor sie Schaden macht.“

**S2 `lagen-2.json` › `lesen-l-06` › `ende1.ende`**
- Zitat: „Sonne, Tabletten und die leise Stimme lieferten die Lage. Wer zuerst die Lage liest oder eine Deutung rechtzeitig zurücknimmt und fragt, erspart beiden ein Missverständnis.“
- Begründung: Die leise Stimme kommt nur in k2 vor. `ende1` wird auch über k3c erreicht („Mir passt was nicht? Ich hab Migräne. Danke auch.“). Dort ist das Missverständnis schon passiert, nichts wurde „erspart“.
- Ersatz: „Das strenge Gesicht hatte mit dem Entwurf nichts zu tun – Sonne und Tabletten lieferten die Lage. Wer zuerst die Lage liest oder eine Deutung zurücknimmt, sobald er sie bemerkt, hält ein Missverständnis klein.“

**S3 `lagen-2.json` › `lesen-l-09` › `k3b.sagt`**
- Zitat: „Jonas schüttelt den Kopf und sagt in Ruhe: „Nein. Die Prüfstände.““
- Begründung: k3b wird auch über „Schnell zu Carla zurück …“ erreicht. Dann hat niemand Jonas etwas unterstellt, und sein „Nein“ antwortet ins Leere.
- Ersatz: „Jonas hebt die Hand und sagt in Ruhe: „Moment. Die Prüfstände.“ Kurze Stille in der Runde.“

**S4 `lagen-3.json` › `lesen-l-12` › `k2b`, erste Wahl → `ende3`**
- Zitat: „„Stimmt, das ist untergegangen. Dienstag eine Viertelstunde – mit einer Runde durch alle?““ (wert 2) → ende3 „… bis Tarek im August merkt, dass niemand seine Kunden übernimmt.“ / „Fast. Wer online nicht reihum mit Namen fragt …“
- Begründung: Die beste Wahl kündigt genau die Runde durch alle an. Das Ende behauptet trotzdem, niemand habe reihum gefragt, und Tareks Problem bleibe offen.
- Ersatz: Ein eigenes Ende `ende4` anlegen und die Wahl dorthin führen.
  - sagt: „Am Dienstag ist die Vertretung in einer Viertelstunde geklärt – auch für Tareks Kunden im August.“
  - ende: „Gut nachgeholt. Online geht eine Frage leicht unter, wenn nach einer Pause einfach weitergemacht wird. Reihum mit Namen gefragt, wäre sie schon am Freitag gekommen.“

**S5 `lagen-3.json` › `lesen-l-13`, drei Brüche**
- (a) **k3b, erste Wahl**
  - Zitat: „… und ihn zum Nachtisch an euren Herd einladen.“
  - Begründung: k3b folgt auf k2 („Du kochst mit ihm“). Er steht schon an deinem Herd.
  - Ersatz: „Die eigene Deutung prüfen – und ihn beim Spülen fragen, was ihn in den Kurs gebracht hat.“
- (b) **k3, erste Wahl**
  - Zitat: „Nächste Woche kochen wir **wieder** zusammen“
  - Begründung: Über k2b hast du mit der Frau gekocht, nicht mit ihm.
  - Ersatz: „„Dann bist du hier richtig. Nächste Woche kochen wir zusammen – zeig mir das mit den Zwiebeln.““
- (c) **ende1.sagt**
  - Zitat: „Und er erzählt dir, wo man rund um die Stadt gut wandert.“
  - Begründung: Er ist laut k3 „neu in der Stadt“.
  - Ersatz: „Drei Wochen später seid ihr die Gruppe mit den besten Zwiebeln. Und er fragt dich, wo man rund um die Stadt gut wandert.“

**S6 `lagen-3.json` › `lesen-l-14` › `k2.sagt`**
- Zitat: „Du fragst ihn nach seiner Arbeit.“
- Begründung: k2 wird auch über k2b erreicht. Dort lautet die beste Wahl „„Das ist er. Wie haben Sie ihn kennengelernt?““. Die Frage passt also nicht zum Weg.
- Ersatz: „Du stellst ihm eine Frage und hörst zu. Er antwortet ausführlich und langsam, mit Pausen zwischen den Sätzen, und erzählt bald von seiner Arbeit: Er ist Ingenieur und baut Brücken. Als du nachfragst, beugt er sich vor.“

**S7 `lagen-3.json` › `lesen-l-15` › `ende2.ende` und `ende3.ende`**
- Zitat ende2: „Die Signale waren da – das „aber“ von Jonas, Tareks lange Pause, die stockende Runde.“
- Zitat ende3: „Fast. Zweierlei hätte noch geholfen …“
- Begründung:
  - `ende2` wird schon aus k2b erreicht („Sah aber so aus.“). Dann gab es weder Jonas' Aber noch Tareks Pause.
  - `ende3` sagt „Fast.“ auch nach einem Vorwurf in k5b. Außerdem passt jeweils nur einer der beiden Punkte zum Weg.
- Ersatz:
  - ende2: „Die Signale waren da – Blicke zum Chef, eine stockende Runde, ein leises Aber. Gedeutet statt gefragt oder überhört, kamen die Bedenken erst als stilles Nein.“
  - ende3: „Zwei Stellen entscheiden in solchen Runden viel: ein Bedenken ohne Vorwurf annehmen – und eine Rückmeldung zu deiner Wirkung prüfen, statt sie abzuwehren oder blind zu glauben.“

**S8 `lagen-2.json` › `lesen-l-08` › `k3`, erste Wahl**
- Zitat: „Zum Sohn: „Und für **dich** ein Tablet fürs Büro und die Termine?““
- Begründung: Alle anderen in der Kundenrunde werden gesiezt, auch der Meister („Sie sind täglich in der Werkstatt“). Den erwachsenen Sohn der Kundin zu duzen, ist ein Bruch, der herablassend wirken kann.
- Ersatz: „„Dann ein fester Rechner in der Werkstatt.“ Zum Sohn: „Und für Sie ein Tablet fürs Büro und die Termine?““

**S9 `einheiten-2.json` › `lesen-2-06-a`, dritte Antwort**
- Zitat: „„Lass uns lieber nach ihren Antworten entscheiden.““
- Begründung: Dr. Albers siezt dich durchgehend: 2-05-b „Sie waren vorhin nicht einverstanden“, gespraech „Begründen Sie das bitte“. Hier duzt du ihn.
- Ersatz: „„Entscheiden wir lieber nach ihren Antworten.““

**S10 `einheiten-3.json` › `lesen-3-04-b` (frage, Antworten) und Karte „Andere Regeln, andere Grundlinie“**
- Zitat: „Du stellst eine Idee vor. Jule (lebhaft, direkt) ruft: „Super!“ Lena (ruhig, genau) …“
- Begründung: Jule ist die Bekannte aus dem Kochkurs, Lena die neue Kollegin. Dass beide bei deiner Idee am Tisch sitzen, passt nicht zur Besetzung. Miriam („herzlich, neckt gern“) erfüllt dieselbe Rolle.
- Ersatz:
  - frage: „Du stellst eine Idee vor. Miriam (lebhaft, herzlich) ruft: „Super!“ Lena (ruhig, genau) sagt: „Hm. Interessant.“ Was liest du heraus?“
  - In der ersten Antwort „Jule ist begeistert …“ → „Miriam ist begeistert …“.
  - In der Karte „bei Jule ist „super“ normal“ → „bei Miriam ist „super“ normal“.

### Fakten und Quellen

**S11 `einheiten-2.json` › `lesen-2-02` (Schritt `studie`, `belegHinweis`, `quellen`)**
- Zitat: „Hilft es, ein Gesicht zu sehen, wenn man beurteilen soll, ob eine Aussage stimmt?“ … „Wer nur die Tonaufnahme hörte, urteilte öfter richtig als wer das Video sah.“
- Begründung:
  - Die Einheit „Die Stimme verrät mehr“ handelt von Gefühlen und Vorbehalten. Ihre Kernstudie stammt aber aus dem Geständnis-Erkennen.
  - Zusammen mit dem Titel entsteht leicht der Eindruck „An der Stimme hört man Lügen“. Genau das widerlegt der Bereich sonst.
  - In Kassin u. a. blieben die Urteile insgesamt mäßig, die Ermittler lagen eher schlechter.
  - Den Ton-Vorteil konnte ich zudem nicht unabhängig bestätigen.
- Ersatz (Studie auf `kraus2017` umstellen):
  - frage: „Liest man Gefühle besser, wenn man das Gesicht nicht sieht?“
  - aufbau: „In fünf Experimenten schätzten Menschen ein, was andere fühlen – einmal nur mit der Stimme, einmal nur mit dem Bild, einmal mit beidem.“
  - ergebnis: „Mit der Stimme allein lagen sie im Mittel etwas genauer als mit dem Bild allein. Gegenüber Bild und Stimme zusammen war der Vorsprung nur in zwei der fünf Experimente deutlich.“
  - grenze: „Kleine Effekte. Das Bild ist nicht wertlos – es lenkt nur manchmal ab.“
  - quellen: [„kraus2017“]
  - belegHinweis der Einheit: den Satz zu den Geständnissen streichen, `kassin2005` aus `quellen` nehmen.
- Kassin bleibt in 3-05, wo es hingehört.

**S12 `wissen.json` › `lesen-w-088` › `text`, `quellen`**
- Zitat: „… nicht treffsicherer als Laien – oft aber selbstsicherer.“ Quellen: `bond2006`, `hartwig2011`, `kassin2005`, `depaulo1997`.
- Begründung (offener Punkt 1 aus Phase 1, nur halb gelöst):
  - `kassin2005` deckt „selbstsicherer“ für **einen** Versuch mit Geständnissen.
  - `depaulo1997` handelt vom Zusammenhang zwischen Sicherheit und Treffern allgemein, nicht von Fachleuten gegenüber Laien.
  - Das „oft“ bleibt deshalb ungedeckt.
- Ersatz:
  - text: „Über viele Studien hinweg waren Menschen, die beruflich Glaubwürdigkeit beurteilen, nicht treffsicherer als Laien. In einem Versuch mit Geständnissen waren Ermittler aber deutlich selbstsicherer – genauer waren sie nicht.“
  - quellen: [„bond2006“, „hartwig2011“, „kassin2005“]

**S13 `einheiten-2.json` › `lesen-2-03` › Mythos, `warum`**
- Zitat: „Aber Menschen glauben an viel mehr Rang-Zeichen, als sich in Studien zeigen – Größe, tiefe Stimme, teurer Anzug.“
- Begründung:
  - `hall2005` untersucht Körpersprache, nicht Körpergröße oder Kleidung.
  - `klofstad2012` zeigt nur, dass Menschen tiefe Stimmen für führungsstärker **halten**, nicht, dass das falsch ist.
  - Für Größe gibt es außerhalb des Bereichs durchaus schwache echte Zusammenhänge. Die Beispiele gehen also über die Quellen hinaus.
- Ersatz: „Manchmal stimmt es. Aber Menschen glauben an mehr und stärkere Rang-Zeichen in der Körpersprache, als sich in Studien zeigen. Oft entscheidet jemand, der wenig sagt.“

**S14 `einheiten-3.json` › `lesen-3-03` › `belegHinweis`**
- Begründung: Die Karte lehrt die „Ähnlichkeit“-Brille („Gleiche Heimat, gleicher Sport … schon wirkt jemand fähiger“). Keine der Quellen deckt sie, und der Hinweis verschweigt das.
- Ersatz: „Halo-Effekt, schnelle erste Eindrücke, die Benachteiligung autistischer Menschen nach wenigen Sekunden und das Übertragen eigenen Interesses sind in einzelnen guten Studien gezeigt. Die Ähnlichkeits-Brille ist hier Praxiswissen ohne eigene Quelle; dass die Gegenprobe Vorurteile im Alltag mindert, ebenfalls.“

### Didaktik und Bewertung

**S15 `einheiten-2.json` › `lesen-2-04` › `mission` (`lesen-m-10`)**
- Begründung:
  - Die oberste Sprosse („Ein wichtiges Gespräch bewusst lesen“, Stufe 10) kommt schon in der vierten Können-Einheit, vor m-06, m-08, m-09 und m-07.
  - Damit läuft die Leiter in k/m als 10 · 6 · 8 · 9 · 7 rückwärts.
  - Inhaltlich fasst m-10 den ganzen Bereich zusammen. Es passt zu 3-05 („Sicherheit ist kein Beweis“: gesehen – vermutet – erfragt).
- Ersatz:
  - 2-04 endet ohne Mission. Statt `{ "art": "mission", "ref": "lesen-m-10" }` zwei Schritte:
    - `{ "art": "experiment", "auftrag": "Wenn du diese Woche ein „grundsätzlich“ oder ein Ja ohne Schwung hörst, lade das Bedenken einmal ein – mit Ausweg. Notier, was kam.", "dauer": "woche", "nachfrage": "Was kam, als du eingeladen hast – und hast du danach lockergelassen?" }`
    - `{ "art": "reflexion", "frage": "Bei wem überhörst du ein leises Aber am ehesten – und warum gerade bei ihm?" }`
  - Feld `mission` entfernen.
  - In 3-05 die Schlussreflexion durch `{ "art": "mission", "ref": "lesen-m-10" }` ersetzen und `"mission": "lesen-m-10"` setzen. Die Einheit hat dann 7 Schritte.

**S16 `tests.json` › fc-025…fc-040: Längen**
- Begründung: Die beste Antwort ist in 13 von 16 neuen Tests die längste. Das Prüfskript meldet es nicht, weil es über alle 40 Tests rechnet (19/40). Im Formcheck ist das besonders heikel.
- Ersatz (danach 5 von 16):
  - fc-026, beste Antwort: „„Klingt noch nicht ganz sicher – passt etwas nicht?““
  - fc-030, zweite Antwort: „„Stimmt, wer wirklich zuhört, schaut einen an – Blickkontakt gehört einfach dazu.““
  - fc-032, dritte Antwort: „Er misstraut dir – sonst würde er nicht so genau nachblättern und nachfragen.“
  - fc-033, erste Antwort: „„Also sind sich alle einig – dann trage ich die Wochenenden gleich in den Kalender ein.““
  - fc-034, erste Antwort: „Sie zögert so lange – also will sie es eigentlich nicht übernehmen und traut sich nur nicht.“
  - fc-036, erste Antwort: „„Heute sind wirklich alle schlecht gelaunt – das liegt bestimmt am Wetter.““
  - fc-039, beste Antwort: „„Sicherheit sagt dabei wenig. Woran machst du es fest?““
  - fc-040, erste Antwort: „Ihm aus dem Weg gehen – er will es ja so, das merkt man seit dem Streit deutlich.“

**S17 `einheiten-2.json` / `einheiten-3.json`: Längen**
- Begründung: Die beste Antwort ist in 11 von 14 Fragen die längste. Das Prüfskript prüft erst ab 10 Fragen je Datei, hier sind es 8 bzw. 6.
- Ersatz (danach 6 von 14):
  - 2-01-a, vierte Antwort: „Sie ist genervt von Tarek, weil der in jeder Runde Witze reißt – das sieht man ihr an.“
  - 2-01-c, erste Antwort: „„Stimmt, sie zieht sich zurück. Lassen wir sie lieber in Ruhe, sie will ja offenbar nicht.““
  - 2-02-a, zweite Antwort: „Sie ist dagegen und traut sich nur nicht, es vor mir und den anderen offen zu sagen.“
  - 3-03-c, dritte Antwort: „Den zweiten streichen – wer kaum aufschaut, wirkt im Team unsicher und kommt bei Kunden schlecht an.“
  - 3-04-b, erste Antwort: „Miriam ist begeistert, Lena hält nichts davon – „interessant“ heißt ja meistens „lieber nicht“.“

**S18 `einheiten-3.json` › `lesen-3-05-a`, zweite Antwort (`wert: 1`)**
- Zitat: „Mäßig – erfahrene Leute liegen mit Sicherheit öfter richtig.“
- Begründung: Das ist eine falsche Tatsachenbehauptung, die eigene Begründung widerlegt sie. Damit ist die Antwort nicht „brauchbar“ im Sinne von `wert: 1`.
- Ersatz:
  - text: „Schwer zu sagen – das müsste man mitzählen.“
  - warum: „Richtig gedacht: Mitzählen ist der Weg. Die Forschung hat es getan – Sicherheit und Treffer hingen kaum zusammen.“

**S19 Teilpunkte für feste Deutungen (Maßstab Phase 1, v-0013)**
- (a) `einheiten-2.json` › `lesen-2-01-a`, dritte Antwort
  - Zitat: „Sie hat bestimmt Migräne. Ich lasse sie heute in Ruhe.“
  - Ersatz text: „Vielleicht Migräne – ich lasse sie heute lieber in Ruhe.“
  - Ersatz warum: „Rücksichtsvoll und nah an der Lage. Ob der Stand passt, weißt du so aber nicht – eine kurze Frage nach der Runde klärt beides.“
- (b) `tests.json` › `lesen-fc-031`, dritte Antwort
  - Zitat: „Das liegt an den Tabletten, da muss ich nichts weiter tun.“
  - Ersatz text: „Vermutlich die Tabletten – ich behalte es im Blick.“
  - Ersatz warum: „Die Lage im Blick, gut. Eine kurze Frage, wie es ihr geht, schadet trotzdem nicht.“

### Vorrat 03 – Gegenleser [v03]

**S20 `lesen-v-0090` (Bühne)**
- Begründung: Fast gleich mit `2-06-c`: gedachte Runde, jedem Gedanken ein Gesicht, Störungen „Handy“ und „nickt“, gleicher Ersatz `v-0087`.
- Ersatz:
  - auftrag: „Steh auf und bring vor einer gedachten Runde von vier Leuten in einer Minute einen Einwand gegen einen Vorschlag vor. Schau beim Einwand die Person an, deren Vorschlag es ist – und beim Lösungsvorschlag die ganze Runde.“
  - stoerungen: [„Die Person, deren Vorschlag es ist, verschränkt die Arme.“, „Die stillste Person schaut dich an.“, „Jemand fragt: „Und was schlägst du stattdessen vor?““]
  - pruefliste: [„beim Einwand den Blick gehalten, ohne zu starren“, „beim Lösungsvorschlag die Runde einbezogen“, „die stille Person angesehen“, „die verschränkten Arme nicht als Angriff gelesen“]

**S21 `lesen-v-0168` › `beschreibung`**
- Begründung: Alles hängt daran, dass Jonas stottert. Das steht nur in der Begründung, nicht in der Beschreibung.
- Ersatz: „Du fragst Jonas, der stottert und offen damit umgeht, nach seiner Meinung zu deinem Entwurf. Er setzt an, stockt bei einem Wort, macht eine Pause und sagt dann: „Der Aufbau ist gut. Den Schluss würde ich kürzen.““

**S22 `lesen-v-0101` › `beschreibung`**
- Begründung: Die Begründungen sagen „Er hört schlecht“ und „fragt oft nach“. Die Lage sagt das nicht.
- Ersatz: „Herr Petersen, der nicht mehr gut hört, sitzt dir gegenüber; du erklärst den neuen Wartungsplan. Er kneift die Augen zusammen, legt die Stirn in Falten und neigt den Kopf zu dir. Im Raum läuft die Lüftung laut.“

**S23 `lesen-v-0161`, dritte Antwort, `warum`**
- Zitat: „… Kälte oder Anspannung vor der Gruppe sein.“
- Begründung: Eine Gruppe kommt in der Aufgabe nicht vor.
- Ersatz: „Du stellst deine Deutung über ihr Wort. Hochgezogene Schultern können auch Kälte, Müdigkeit oder Anspannung sein.“

**S24 `lesen-v-0140`, beste Antwort, `warum`**
- Zitat: „Blick, kurze Antworten und Körper zeigen in eine Richtung.“
- Begründung: Wohin der Körper zeigt, ist nicht beschrieben.
- Ersatz: „Wiederholte Blicke zu seiner Abteilung und kurze Antworten passen zusammen. Du machst es ihm leicht – und siehst an seiner Reaktion, ob du richtig lagst.“

**S25 `lesen-v-0131`, beste Antwort**
- Zitat: „„Der Termin ist für Sie knapp, oder?““
- Begründung: Das ist eine Deutung mit Fragezeichen, keine offene Frage.
- Ersatz: „Kurz innehalten und fragen: „Wie passt Ihnen der Termin?““

**S26 `lesen-v-0166`, zweite Musterlösung**
- Zitat: „„Mir ist aufgefallen, dass die Feier kein gutes Thema ist.““
- Begründung: Die Musterlösung verletzt ihr eigenes Kriterium „nennt die Beobachtung“.
- Ersatz: „„Mir ist aufgefallen, dass wir beim Thema Feier jedes Mal woanders landen. Wie geht's dir damit?““

**S27 `lesen-v-0142`, zweites Zeichen, `warum`**
- Zitat: „… in Worten das deutlichste Zeichen.“
- Begründung: Das überhöht ein einzelnes Zeichen.
- Ersatz: „Eine Frage nach den Kosten kann Planung sein – zusammen mit dem zögerlichen Handheben aber ein Hinweis auf Bedenken.“

### Vorrat 04 – Gegenleser [v04]

**S28 `lesen-v-0237`, zweite Antwort (`wert: 1`)**
- Zitat: „Bei starken Gefühlen schon, bei schwachen nicht.“
- Begründung: Die eigene Begründung widerlegt die Antwort.
- Ersatz:
  - text: „Übertrieben – im Gesicht sieht man manches, aber nicht jedes Gefühl.“
  - warum: „Gut gebremst. Es fehlt: Derselbe Ausdruck kommt bei verschiedenen Gefühlen vor – Lage und Nachfragen gehören dazu.“

**S29 `lesen-v-0225`, beste Antwort und Frage**
- Zitat: „„Ich schaue beim Zuhören nur konzentriert. Der Plan gefällt mir.““
- Begründung: Die beste Antwort behauptet eine Tatsache, die nicht in der Aufgabe steht: einen Plan, der dir gefällt.
- Ersatz:
  - beste Antwort: „„Danke, dass du fragst. Ich schaue beim Zuhören nur konzentriert – sauer war ich nicht.““
  - frage: „Was tust du?“ statt „Was antwortest du?“, weil die erste Antwort eine Handlung ist.

**S30 `lesen-v-0252`, beste Antwort und erste Begründung**
- Zitat: „Eine Pause ist bei ihr kein Zögern.“ / „In einer Zweitsprache sprechen fast alle langsamer.“
- Ersatz:
  - beste Antwort: „Die langsame mit Pausen – so spricht sie Deutsch. Eine Pause heißt bei ihr nicht gleich Zögern.“
  - erste Begründung: „In einer Zweitsprache sprechen viele langsamer.“

**S31 `lesen-v-0182`, Figuren**
- Zitat: „Kochkurs … Wenn Sven erzählt … Du bist zum ersten Mal dabei.“
- Begründung: Du kennst Jule schon aus dem Kochkurs. Sven ist ein alter Freund, wird hier aber wie ein Fremder gelesen.
- Ersatz:
  - beschreibung: „Wanderverein, dein erster Abend. Nach der Tour sitzen sechs am Tisch. Wenn der Kassenwart erzählt, lehnen sich zwei zurück und schauen auf ihre Teller. Wenn die Wanderführerin erzählt, beugen sich alle vor.“
  - Antworten entsprechend:
    - „Der Kassenwart ist unbeliebt.“
    - „Die Wanderführerin hat hier das Sagen.“
    - „Bei der Wanderführerin ist die Runde gerade zugewandter. Warum, zeigt sich vielleicht im Lauf des Abends.“

**S32 `lesen-v-0248` (Kunstgriff)**
- Begründung: Fast-Dublette zu `v-0169` (Autohaus, „an Ihrem Blick“ → unterschreiben). Die Fähigkeit `grundlinie` wird nicht genutzt.
- Ersatz-lage: „Probetraining im Fitnessstudio. Der Berater: „Ich hab dich eine Stunde beobachtet. Sonst redest du viel, beim Vertrag bist du still geworden – du bist überzeugt. Ich druck ihn schon mal aus.““
- Antworten:
  - `wert: 0`, Tendenz `glaeubig`: „Er hat recht – still geworden bin ich ja wirklich.“ / warum: „Still werden kann Nachdenken, Zweifel oder Rechnen heißen. Er wählt die Deutung, die ihm nützt.“
  - `wert: 2`: „Eine Stunde ist keine Grundlinie – und Stille kein Ja. Hier soll eine Deutung meine Zusage ersetzen.“ / warum: „Er gibt eine Beobachtung als Wissen aus und handelt schon danach. So wird aus Nachdenken scheinbar Zustimmung.“
  - `wert: 1`: „Ich lache und sage, dass ich noch überlege.“ / warum: „Gut, du lässt dich nicht drängen. Noch klarer: die Deutung offen zurückweisen.“
  - `wert: 0`, Tendenz `glaeubig`: „Ein Zeichen, dass er mich gut versteht – da sollte ich zugreifen.“ / warum: „Eine freundliche Deutung seiner Deutung – entschieden hast du damit immer noch nicht selbst.“
- erklaerung: „Druck mit angeblich gelesener Grundlinie: Wer dich kaum kennt, behauptet, deine Stille als Ja zu erkennen, und behandelt sie wie eine Zusage. Abwehr: „Still heißt bei mir: Ich denke nach. Ich entscheide zu Hause.“ Und nichts unterschreiben, was du nicht entschieden hast.“
- Klasse `rot` bleibt.

**S33 `lesen-v-0219`, zweite Musterlösung**
- Zitat: „„Sie ist zurückhaltend. …““
- Begründung: „zurückhaltend“ ist eine Deutung. Das Kriterium verlangt, nur zu beschreiben, was zu sehen war.
- Ersatz: „„Sie grüßt kurz und sitzt mittags allein. Kann Unsicherheit in der neuen Stelle sein, kann eine andere Gewohnheit sein – ich lade sie einfach mal mit ein.““

**S34 `lesen-v-0231`, zweite Musterlösung**
- Zitat: „„Gut, dass du's sagst. Abweisend bin ich nicht – sag mir beim nächsten Mal direkt …““
- Begründung: Die Antwort weist die Rückmeldung zurück, statt sie anzunehmen, und fragt nicht nach dem Moment.
- Ersatz: „„Gut, dass du's sagst – so meine ich es nicht. Bei welcher Runde ist dir das zuletzt aufgefallen?““

---

## KANN (46)

### Einheiten, Lagen, Tests, Wissen, Kurs (19)

**K1 `kurs.json`: Reihenfolge der Lagen**
- Die Lagen laufen k: l-06, l-08, l-07, l-09 und m: l-12, l-13, l-14, l-11. Inhaltlich ist das richtig, jede Lage folgt ihrer Einheit.
- Anders als bei `ruhe` steht das nicht in `08`.
- Vorschlag für die Zeile `lesen` unter „Lehrplan-Abweichungen der Phasen Können/Meisterschaft“: „Lagen im Kursplan nach der Einheit, die sie voraussetzt (k: 06, 08, 07, 09; m: 12, 13, 14, 11)“.

**K2 `einheiten-3.json` › `lesen-3-05` › experiment**
- Zitat: „Führ zwei Wochen lang eine Trefferliste“ bei `"dauer": "woche"`.
- Ersatz: „Führ diese Woche eine Trefferliste: …“, und in der Nachfrage „nach einer Woche“.

**K3 `lesen-3-01-b`, zweiter Eintrag, `warum`**
- Zitat: „auf diese Frage schweigen die meisten.“
- Begründung: Mengenwort ohne Beleg.
- Ersatz: „auf diese Frage schweigen viele.“

**K4 `lesen-2-03-a`, erstes Zeichen, `warum`**
- Zitat: „eines der aufschlussreichsten Zeichen“
- Begründung: Praxiswissen als Rangfolge.
- Ersatz: „Wohin die anderen bei einer Entscheidungsfrage schauen, ist ein aufschlussreiches Zeichen – zusammen mit anderen.“

**K5 `lesen-l-15` › k3**
- Zitat: „Aber die Werkstatt hat kein Netz.“
- Begründung: Jonas ist aus der Werkstatt zugeschaltet.
- Ersatz: „Aber in der Werkstatt ist das Netz schwach.“

**K6 `lesen-l-15` › k3, zweite Wahl, `rueck`**
- Begründung: Jonas stottert. „Schreib es lieber in den Chat“ kann wirken, als solle er besser nicht sprechen.
- Ersatz: „Bei schlechter Leitung manchmal sinnvoll. Er hatte seinen Punkt aber schon gesagt – und es kann wirken, als solle er lieber nicht sprechen.“

**K7 `lesen-l-14` › k3**
- Zitat: „„Und Sie? Was ist Ihre Arbeit wert?““
- Begründung: Wirkt wie gebrochenes Deutsch als Stilmittel.
- Ersatz: „„Und Sie? Wofür ist Ihre Arbeit gut?““ (bleibt direkt).

**K8 `lesen-l-13` › k2, zweite Wahl, `rueck`**
- Zitat: „das Strahlen der anderen überhörst du“
- Begründung: Es strahlt er, und man sieht es, man hört es nicht.
- Ersatz: „Du liest nur, was dein erstes Bild bestätigt – den Dank der anderen übersiehst du.“

**K9 `lesen-fc-034`, dritte Antwort**
- Begründung: „Ein Ja ist ein Ja.“ bekommt hier `wert: 1`, in `2-02-a` aber fast wortgleich `wert: 0`.
- Ersatz: „Ein Ja ist ein Ja – online deute ich keine Pausen.“

**K10 Motiv „Tabletten/Schmerz“ viermal**
- Fundstellen: `2-01-a` (Tablette, Jalousie), `l-06` (Tabletten, Sonne), `fc-025` (Rücken), `fc-031` (Tabletten).
- Begründung: Wer die Einheit kennt, erkennt den Test wieder.
- Vorschlag fc-031: „Seit Montag hat sie Nachtschichten im Krankenhaus.“ statt Allergietabletten; die Antworten entsprechend.

**K11 `wissen.json` › `lesen-w-017`**
- Zitat: „Ablehnende oder ausweichende Antworten kommen eher etwas später“
- Begründung: Laut `kendrick2015` gibt es meist keinen Unterschied, erst ab etwa 0,7 s.
- Ersatz: „Ablehnende oder ausweichende Antworten kommen im Mittel etwas später – deutlich wird das erst bei längeren Pausen, oft mit einer Einschränkung davor: …“
- Dasselbe gilt für [v03] `v-0137`, Begründung zum ersten Eintrag.

**K12 `lesen-w-016` und `lesen-w-096`**
- Zitat w-016: „oder den besten Anzug trägt“. Kleidung liegt außerhalb von `hall2005`.
- Ersatz w-016: „oder am lautesten lacht“.
- w-096: „Darum hält er an Zeichen fest, die oft nichts sagen.“
- Ersatz w-096: „… die über Einfluss im Raum wenig sagen.“

**K13 Beleg A bei `lesen-3-05` und `lesen-w-019`**
- Begründung: Eine Meta-Analyse über 18 Stichproben (1997) und ein Einzelversuch reichen knapp für A („mehrfach bestätigt“).
- Vorschlag: B. Alternativ A lassen und im Hinweis „eine ältere Meta-Analyse“ sagen.

**K14 `lesen-l-09` › k2 nach k2c**
- Begründung: Die Frage nach dem „grundsätzlich“ wird doppelt gestellt (k2c-Wahl und k2.sagt „Du fragst: …“).
- Ersatz k2.sagt: „Carla überlegt. Bevor sie antwortet, setzt Jonas an. Er stockt vor dem ersten Wort, länger.“
- Ersatz k1, zweite Wahl: „Bei Carla ungewohnt: Pause, „grundsätzlich“, Blick weg. Ich frage: „Was müsste passen, damit es ein klares Ja ist?““

**K15 Lagen mit zwei Wahlen**
- Befund: In `lagen-2`/`lagen-3` ist bei Knoten mit zwei Wahlen die beste fast immer die längere (35 von 40). Die schwache ist oft ein kurzer Satz wie „„Klang aber so.““ oder „„Sah aber so aus.““. Die Reihenfolge mischt die App, die Länge nicht.
- Vorschlag: In etwa zehn Knoten die schwache Wahl ausformulieren, z. B. l-11 k2c: „„Na ja, so wie Sie dasitzen, sah es schon sehr danach aus, ehrlich gesagt.““
- Außerdem die Prüfskript-Statistik auf `wahl` ausweiten (Hauptstrang).

**K16 `lesen-l-10` › ende1.sagt**
- Zitat: „Die Auszubildende schickt eine Liste mit Wünschen für den Empfang.“
- Begründung: Das gilt auch für den Weg „Sie in Ruhe lassen – sie ist offensichtlich nicht interessiert“.
- Ersatz: „Zwei Tage später unterschreibt die Praxis – mit Miriam als fester Ansprechpartnerin.“

**K17 `lesen-3-04` Karte**
- Zitat: „Pausen vor Antworten sind je nach Sprache etwas verschieden lang, in einer Zweitsprache länger.“
- Begründung: Der zweite Teil steht nicht in `stivers2009`.
- Ersatz: „…, in einer Zweitsprache oft länger.“ Im belegHinweis „das Letzte ist Praxiswissen“ ergänzen.

**K18 `lesen-l-15` › k1, beste Wahl**
- Zitat: „Miriam dafür“
- Begründung: Eifriges Nicken ist eher ein Zeichen als ein Befund.
- Ersatz: „Das Muster festhalten: Miriam wohl dafür, Albers' Blick allein sagt wenig, die beiden online kann ich kaum lesen.“

**K19 Bewerbungsrunde fünfmal**
- Fundstellen: `2-06-a`, `3-03-c`, `fc-035`, [v03] `v-0146`, [v04] `v-0223`.
- Vorschlag: `fc-035` in einen anderen Rahmen setzen: „Ein neuer Kunde am Telefon spricht mit starkem Akzent …“. Die Antworten bleiben dem Sinn nach, „Inhalt, nicht Klang“.

### Vorrat 03 [v03] (9)

**K20 `v-0092`**
- Befund: Fast dieselbe Szene wie `2-05-b`.
- Neue Frage: „Du hörst Jule im Kochkurs zu, während du in Gedanken das Rezept durchgehst. Sie fragt: „Langweile ich dich?“ Was lernst du daraus?“ Die Antworten bleiben dem Sinn nach.

**K21 Rang-Übungen `v-0149`, `v-0152`, `v-0153`, `v-0157`**
- Befund: Alle laufen auf „wohin schauen die anderen“ hinaus, dazu kommen `2-03-a` und `v-0188`.
- Vorschlag für `v-0153`, erstes Zeichen: „Ihr Vorschlag für den Ort wird beim Abschied noch einmal wiederholt.“ / warum: „Was andere später aufgreifen, zeigt, wessen Wort zählt.“

**K22 `v-0152`, fünftes Zeichen**
- Zitat: „Körpergröße sagt über Einfluss in diesem Raum nichts.“
- Ersatz: „Körpergröße halten viele für ein Rangzeichen – über Einfluss in diesem Raum sagt sie allein wenig.“

**K23 `v-0121`, letztes Zeichen**
- Zitat: „Er hört nicht mehr gut.“
- Ersatz: text „Er fragt am Telefon oft „Wie bitte?“ – wie schon immer.“ / warum „Gehört zu seiner Grundlinie – keine Veränderung.“

**K24 `v-0160`, beste Antwort, `warum`**
- Zitat: „die meisten“
- Ersatz: „Vor anderen antworten viele nur höflich.“

**K25 `v-0150`, `wert: 1`**
- Zitat: „Beide gleich, das kann man nicht sagen.“
- Ersatz: „Das lässt sich nicht sagen – beide könnten Einfluss haben.“

**K26 `v-0146`, beste Antwort**
- Zitat: „Er ist nervös – …“
- Ersatz: „Er wirkt nervös – das sagt wenig über seine Eignung. Die Antworten zählen.“

**K27 `v-0143`, Frage**
- Ersatz: „Welche Zeichen würden deinen Eindruck stützen – und welche sagen bei Miriam wenig?“

**K28 `v-0137`**
- Siehe K11.

### Vorrat 04 [v04] (18)

**K29 `v-0210`, beste Antwort, `warum`**
- Zitat: „bei 54 Prozent, der Münzwurf bei 50“
- Begründung: Im Vorrat steht keine Quelle.
- Ersatz: „Über viele Studien lagen Menschen nur knapp über dem Münzwurf. „Verblüffende Treffer“ sind Erfahrungsberichte, keine Belege.“

**K30 `v-0181`, erste Antwort, `warum`**
- Begründung: „die Zahlen, über die Tarek spricht“ steht nicht in der Lage.
- Ersatz: „Vielleicht liest er beim Zuhören nur mit. Eine Absicht lässt sich daraus nicht lesen.“

**K31 `v-0211`, Lage**
- Ersatz: „über deinen Bericht mit den Quartalszahlen“, weil Antworten und Erklärung die Zahlen nennen.

**K32 `v-0188`, schwache Hinweise**
- Ersatz:
  - „Sie hat den Raum gebucht.“ / warum: „Organisieren ist nicht Entscheiden.“
  - „Sie trägt als Einzige ein Sakko.“ / warum: „Kleidung halten viele für ein Rangzeichen – verlässlich ist sie nicht.“

**K33 `v-0173`, dritter Hinweis, `warum`**
- Zitat: „das deutlichste Zeichen“
- Ersatz: „Eine Frage nach dem schwierigen Fall – für ihn ist noch etwas offen. Deutlich, weil es in Worten kommt.“

**K34 `v-0175`, fünfter Hinweis, `warum`**
- Ersatz: „Kann Interesse sein, kann bloße Gewohnheit sein – allein offen.“
- Dazu: `v-0175`, `v-0188` und `v-0218` von Stufe 9 auf Stufe 7 setzen, weil sie kaum schwerer sind als die Aufgaben der Stufe 6.

**K35 `v-0190`, beste Antwort, und `v-0196`, zweite Musterlösung**
- Befund: doppelte Anführungszeichen innerhalb wörtlicher Rede.
- Ersatz: „Dein ‚passt‘ …“ / „Klingt nach ‚vielleicht‘ …“ (halbe Anführungszeichen wie in `2-04-b`).

**K36 `v-0193`, dritte Antwort (`wert: 1`)**
- Zitat: „Egal, es war nur ein Witz.“
- Ersatz: „Weitermachen – und beim nächsten Punkt die beiden zuerst fragen.“ / warum: „Holt sie zurück, gut. Dass sie gerade abgehängt waren, sprichst du so aber nicht an.“

**K37 `v-0223`, beste Antwort**
- Begründung: „vorher“ ist nach den Vorstellungen nicht mehr möglich.
- Ersatz: „Für beide dieselben Maßstäbe festlegen und die Ideen getrennt vom Auftreten bewerten.“

**K38 `v-0226`, Frage**
- Zitat: „schaut jedes Mal nervös auf deinen Stift“
- Ersatz: „schaut jedes Mal auf deinen Stift und stockt kurz“

**K39 `v-0227`, dritte Antwort, `warum`**
- Ersatz: „Mehr Zuwendung für die anderen hilft mehr als weniger für die, die dir ähneln.“

**K40 `v-0236`, vierte Antwort, `warum`**
- Ersatz: „achte darauf, was er tut“ statt „achte, was er tut“.
- Dazu Tendenz der ersten Antwort: `misstrauen` statt `glaeubig`.

**K41 `v-0238`, `wert: 1`**
- Zitat: „„Du findest es furchtbar, oder?““
- Begründung: `v-0207` wertet „fertige Deutung mit Fragezeichen“ als schwach.
- Ersatz: „„Hm – nicht so deins?““ / warum: „Eine Prüf-Frage, gut. Noch offener, wenn du nicht schon die Richtung vorgibst.“

**K42 `v-0239`, vierte Antwort**
- Ersatz: „Nichts weiter tun – sie hat genickt, das reicht mir als Rückmeldung.“

**K43 `v-0240`**
- Begründung: „Gemeinderatssitzung“ streift Politik (06 §1).
- Ersatz: „Unter einem Video von der Jahresversammlung eines Sportvereins kommentieren viele: „Schaut euch das Gesicht des Vorsitzenden an, als er zum neuen Vereinsheim gefragt wird – der lügt doch!““
- Beste Antwort entsprechend „… schaut sich die Fakten zum Vereinsheim an.“

**K44 `v-0245`, erste Antwort**
- Ersatz: Tendenz `gleichmachen` statt `einzelzeichen`.

**K45 `v-0249`, zweiter Eintrag, `warum`**
- Ersatz: „verhalten sich viele anders“ statt „verhält sich fast jeder anders“.

**K46 `v-0233`, erste Antwort, `warum`**
- Ersatz: „Sie sehen deinen Rücken und hören dich, vom Mikrofon abgewandt, vielleicht schlechter. Ankommen ist mehr als Ton.“
- Nebenbei [v04]: `v-0185` ähnelt im Kern einer Phase-1-Testfrage („Dieselbe Haltung bei fast allen … spricht für die Lage“).

---

## Ohne Befund (ausdrücklich geprüft)

- **Einfluss-Klassen:** Keine Einheit und keine Lage in k/m setzt eine Einflusstechnik ein (kein `einfluss` nötig). Rote Kniffe (`v-0169`, `v-0210`–`0212`, `v-0247`, `v-0248`) stehen nur als `kunstgriff` mit Abwehr. Keine Mission ist rot oder Taktik.
- **Laut und leise:** `2-05-a` → `v-0086` und `2-06-c` → `v-0087` sind stumme Übungen derselben Fähigkeit mit demselben Ziel. `v-0089`/`v-0090` siehe M1/S20.
- **Kursplan:**
  - k: 6 E, 6 Ü, 4 L, 3 A, 1 S (20). m: 5 E, 5 Ü, 4 L, 3 A, 1 S (18).
  - Bänder [3,6]→[4,7] bzw. [5,8]→[6,10], wie LIESMICH 3a.
  - Jeder Übungstag ist doppelt gefüllt, auch leise.
  - Die Sparrings „Der Termin in der Praxis“ und „Die Besprechungsrunde“ entsprechen `08`.
- **Zahlen:**
  - „gut drei Sekunden“ (`binetti2016`), „Viertelsekunde, zehn Sprachen“ (`stivers2009`), „halbe statt gut einer Zehntelsekunde“ (`boland2022`), „18 Stichproben“ (`depaulo1997`): alle mit geprüfter Quelle.
  - `hall2005` erscheint überall ohne Einzelzahl.
  - Erfundene Zahlen in Geschichten („Neunzig von hundert“, „zehn Minuten“) sind als Erzählung erkennbar.
- **Sprache:** Du-Form, „Sie“ nur in wörtlicher Rede (Anrede-Brüche siehe S8, S9), „…“ durchgehend, keine verbotenen Wörter. Die Tendenz `blossstellen` ist jetzt in ASCII geschrieben (offener Punkt 4 aus Phase 1).
- **Stottern (Jonas):** In `2-04-a`, `l-09` und `l-15` wird das Stocken nie nachgeahmt. Die beste Wahl ist stets „warten, ausreden lassen“, das Stocken gilt nie als Zögern.
- **Rufnummern:** keine.

## Urteil

**Freigabereif nach Einarbeitung der Muss-Befunde.** Inhaltlich ist der Bereich ehrlich und frei von Körpersprache-Hokuspokus. Er schützt Menschen, die anders sprechen, schauen oder fühlen.

Die zehn Muss-Befunde sind fast alle mechanisch zu beheben:

- sieben Lagen-Enden und Lagen-Wege,
- eine Test-Frage,
- eine Bühnen-Dublette,
- eine Teilpunkte-Antwort.

Danach sollten der Längenausgleich (S16/S17) und die Fakten-Präzisierungen (S11–S14) folgen.

**Für den Hauptstrang:**

- Die Längen-Statistik des Prüfskripts auf Lagen (`wahl`) und auf die neuen Testblöcke je Phase ausweiten.
- `flirten/wissen.json` ist zur Zeit kein gültiges JSON (Zeile 29, „`] },, "art"`“), deshalb bricht `coach-pruefe.mjs` ab.

---

## Umsetzung (25.11.2026)

**Stand danach:** `node scripts/coach-pruefe.mjs --nur lesen` → 0 Fehler, 0 Hinweise; `--soll lesen` leer; `_index.json` neu erzeugt. Beste Antwort = längste (eigene Zählung, Prüfskript zählt inzwischen Lagen und Tests je Phase): `einheiten-2` 3/8, `einheiten-3` 2/6, `lagen-2` 12/32, `lagen-3` 14/34, Tests Können 2/8, Meisterschaft 2/8; die längste Antwort ist nirgends mehrheitlich eine falsche (höchstens 5/8). Keine Kennung geändert, nichts gelöscht, keine Bild-Szene berührt (in den k/m-Dateien gibt es keine). Alle Lagen-Enden nach den Änderungen auf jedem Weg nachgegangen.

### Muss
- **M1** umgesetzt (`v-0089` neu: Ablauf erklären mit zwei „Was man nicht sieht“-Sätzen; `leise` jetzt `v-0088`, das genau diese Sätze still vorbereitet).
- **M2** umgesetzt; dazu K29.
- **M3** umgesetzt, leicht angepasst: „Stille, „mhm“, ein Zögern“ statt „ein Ja ohne Schwung“ – über k2c sagt Jule „Doch, doch!“, kein Ja ohne Schwung. Zusätzlich `ende2`: „verdient eine Frage, bevor es losgeht“ statt „keine Einkaufsliste“ (über k2c gab es keine Liste).
- **M4** umgesetzt, ohne den Schlusssatz zu Jonas: Über k2b → k3p stockt Jonas nie, der Satz hätte einen nicht gegangenen Weg beschrieben. Das Prinzip steht weiter in `prinzipien`.
- **M5** umgesetzt. Dazu `ende1`: Schluss ebenfalls als Rückschau-Frage statt „wo du am sichersten warst“.
- **M6** umgesetzt (Weg über k2 Wert 1 geprüft: geöffnet wurde die Runde auf jedem Weg nach k2).
- **M7** umgesetzt, Schlusssatz neutral: „Wer reihum mit Namen fragt, hört sie schon in der Runde statt erst danach.“ `ende1.sagt` ohne Albers' „Gute Runde.“ (lobte auch den Weg „Tarek abhaken“).
- **M8** umgesetzt.
- **M9** umgesetzt (k2 zweite Wahl → k3). k4b bleibt über k3 Wert 0 erreichbar.
- **M10** umgesetzt.

### Sollte
- **S1, S2** umgesetzt (S2 geschlechtsneutral: „sobald sie auffällt“). Zusätzlich `ende3.sagt`: „sieht sie den Entwurf ganz anders“ (über k3b gab es keine Frage zu Seite drei).
- **S3** umgesetzt; Rückmeldung der Wert-1-Wahl in k3b passt jetzt zu beiden Wegen („nicht den Raum gelassen“).
- **S4** umgesetzt (`ende4` neu). Zusätzlich `ende3` ohne „Fast.“ und für beide Wege (k3 Wert 0, k3b Wert 1) neu gefasst; `ende2` passt jetzt auch zum Weg „Steht doch im Entwurf“ (abgewehrt, Mails „in den Tagen danach“).
- **S5** (a–c) umgesetzt. Zusätzlich `ende1.ende` („ein erstes Bild“, „ein zweiter Blick“ – auf dem Weg über k1 Wert 1 gab es keine Gegenprobe) und `ende3` (passte nicht zum Weg „Das tut mir leid“ nach gemeinsamem Kochen).
- **S6, S7** umgesetzt. `ende2` von l-15 aber anders als vorgeschlagen: Auch der Vorschlag nannte über k2b nie Erlebtes („Blicke zum Chef, ein leises Aber“). Neu: „Die Bedenken waren in der Runde – nur kamen sie nicht auf den Tisch. Wer deutet statt fragt, an einer Deutung festhält oder ein Bedenken wegwischt, hört es erst als stilles Nein.“
- **S8, S9, S10** umgesetzt.
- **S11** umgesetzt, Studie auf `kraus2017`. Die Angabe „Vorsprung nur in zwei der fünf Experimente deutlich“ am Ergänzungsmaterial der Zeitschrift bestätigt (Experimente 2 und 3 signifikant gegenüber Bild+Stimme, 1, 4, 5 nur in dieselbe Richtung); „genauer als nur mit Bild“ steht in der Zusammenfassung. Der Aufbau sagt ehrlich „in einem Teil der Versuche nur über das Bild“. `quellen.json` › `kraus2017` entsprechend ergänzt; `kassin2005` aus 2-02 entfernt.
- **S12, S13, S14** umgesetzt. 2-03 `belegHinweis` nennt zusätzlich den Laborversuch zur tiefen Stimme (`klofstad2012`).
- **S15** umgesetzt (2-04 endet mit Experiment + Reflexion, 7 Schritte; 3-05 endet mit `lesen-m-10`, 7 Schritte).
- **S16** umgesetzt (fc-026, 030, 032, 033, 034, 036, 039, 040), teils mit zusätzlich gekürzter bester Antwort (fc-033, 034, 040) oder verlängerter Wert-1-Antwort (fc-039), damit keine Gleichstände bleiben.
- **S17** umgesetzt (2-01-a vierte Antwort ohne „das sieht man ihr an“, weil die Szene keine Stirn nennt: „so, wie sie da die Augen zusammenkneift“); zusätzlich 2-06-a und 3-05-a ausgeglichen.
- **S18, S19** umgesetzt (S19b zusammen mit K10).
- **S20–S34** umgesetzt (S29 inkl. „Was tust du?“).

### Kann
- **K1** nur außerhalb lösbar (`08_ENTSCHEIDUNGEN.md`) → Hauptstrang.
- **K2, K3, K4, K5, K6, K7, K8, K9, K11, K12, K14, K16 (angepasst), K17, K18** umgesetzt. K16: `ende1.sagt` nur noch „Zwei Tage später unterschreibt die Praxis.“ – auch „mit Miriam als fester Ansprechpartnerin“ stimmte nicht auf dem Weg über k4 Wert 1. K12: w-016 „am lautesten lacht“ statt „den besten Anzug“.
- **K10** umgesetzt (fc-031: Nachtschichten statt Allergietabletten).
- **K13** teils: Beleg A bleibt (Meta-Analyse plus Einzelversuche, dazu `bond2006`/`tenney2007` in 3-05), aber 3-05 und w-019 sagen jetzt „eine ältere Meta-Analyse (1997, 18 Stichproben)“.
- **K15** teils: Längen in Lagen über rund 25 Knoten ausgeglichen, darunter l-11 k2c wie vorgeschlagen. Prüfskript zählt Lagen bereits.
- **K19** umgesetzt (fc-035 jetzt Kundentelefonat, Sinn unverändert).
- **K20–K28** umgesetzt. K21 abweichend: In `v-0153` ersetzt der neue Hinweis das Blick-Zeichen („Bei Uneinigkeit schauen alle zu ihr“), nicht das Kalender-Zeichen – so sinkt die Zahl der „wohin schauen“-Zeichen tatsächlich.
- **K29–K43, K45, K46** umgesetzt (K34 inkl. Stufe 9 → 7 für v-0175, v-0188, v-0218; `--soll` bleibt leer).
- **K44** bewusst nicht: Die erste Antwort in `v-0245` vergleicht mit einer anderen Lage, nicht mit anderen Menschen; `gleichmachen` trägt schon die dritte Antwort. Beide Tendenzen passen nur halb – Geschmack.
- **v-0185** (Nebenbemerkung zu K46) bewusst nicht geändert: Das Prüfskript meldet keine Ähnlichkeit zu einem Test, die Übung ist inhaltlich richtig.

### Eigene Funde beim Einarbeiten
- `v-0166`: „Dein Partner“ verletzt LIESMICH §5 → „Die Person, mit der du zusammenlebst“.
- `l-08` k3b, `l-09` k2c/k3, `l-07` k2b, `l-10` k4, `l-12` k2b/k3b, `l-13` k2/k2b, `l-14` k2/k2c, `l-15` k2/k5/k5c: schwache Wahlen ausformuliert bzw. beste gekürzt (Längen), Rückmeldungen geprüft.

### Für den Hauptstrang
- K1: Zeile `lesen` in `08` ergänzen: „Lagen im Kursplan nach der Einheit, die sie voraussetzt (k: 06, 08, 07, 09; m: 12, 13, 14, 11); Mission m-10 erst am Ende von 3-05“.
- `flirten/wissen.json` ist inzwischen wieder gültig; das Prüfskript lief durch.
