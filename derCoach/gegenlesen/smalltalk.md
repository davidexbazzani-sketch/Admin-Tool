# Gegenlesen: Bereich `smalltalk` („Smalltalk & Kontakt“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser aus drei Blickwinkeln: Kommunikationstrainerin für Netzwerken und Gesprächsführung, introvertierter Nutzer, der Smalltalk anstrengend findet, und Faktenprüfung (Sozialpsychologie, Replikationskrise) · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/01_KONZEPT.md` (Abschnitt 10 und 18), `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/kern/inhaltTypen.ts`.
- Alle Dateien in `src/coach/inhalt/smalltalk/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1` (jeder Weg durch alle fünf Lagen und die drei Dialoge), `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `besetzung.json`, die gemeinsamen Quellen und die Quellen von `mut/` und `flirten/`, die `smalltalk` mitbenutzt. Die Nachbarbereiche `mut/`, `flirten/` und `konter/` habe ich auf Widersprüche durchsucht. Gefunden habe ich keine: Pendler-Studien und Gesprächsende kommen nur hier vor, und `sandstrom2022` und `boothby2018` sind in `mut` gleich wiedergegeben.
- An der Quelle geprüft (Volltext, Abstract oder Presse der Autoren):
  - **Epley & Schroeder 2014** (Volltext): Die Schätzungen „unter 47 %“ und „unter 45 %“ sind richtig. Sie stammen aus zwei eigenen Vorhersage-Gruppen: in 3a Pendler, in 3b Studierende aus einem Teilnehmerpool. „Not a single person reported being rebuffed“ steht so da. ✓ Im Warteraum (Exp. 5) war Angesprochenwerden so angenehm wie Ansprechen. ✓ Die Nachbefragung zum Gesprächsbeginn gibt es wirklich: 62 Personen angeschrieben, 31 antworteten. Von denen, die sich erinnerten, sprachen 29 % über Aktuelles (z. B. Wetter) und 39 % stellten eine persönliche Frage. „Meist ganz gewöhnlich … kleine Nachbefragung“ (`w-006`, `w-081`, `1-02`) ist damit gedeckt. ✓
  - **Schroeder, Lyons & Epley 2022:** Feldexperiment mit Pendlern im Raum London. Das Gespräch wurde als angenehm erwartet, gefürchtet war der Anfang. ✓
  - **Sandstrom & Dunn 2014** (PSPB, schwache Bindungen): als Zusammenhang wiedergegeben. ✓ Die Kaffee-Studie (2014b) ist als `geprueft: false` markiert und nennt keine Zahl. ✓
  - **Kardas, Kumar & Epley 2022:** Tiefe Gespräche waren weniger peinlich und verbindender als erwartet. Wer beide Gespräche erlebt hatte, zog das tiefe vor. Die Gespräche waren meist von der Versuchsleitung angestoßen. ✓ Das Aha von `1-06` übertrieb den Befund („viel seltener peinlich“) und wurde korrigiert.
  - **Mehl 2010:** 79 Studierende, 4 Tage EAR, „etwa ein Drittel so viel Smalltalk, doppelt so viele tiefe Gespräche“. ✓ (Seite war bei PMC gesperrt; die Angaben entsprechen dem bekannten Abstract.)
  - **Milek 2018:** 486 Personen, 5 Stichproben, darunter die Originalstichprobe. Für tiefe Gespräche r = .15 bis .23, für Smalltalk kein verlässlicher Zusammenhang. ✓ Das Wort „schwach“ im Text ist vertretbar, die Autoren selbst sagen „moderate“. Die Quelle sagt richtig „schwach bis mäßig“.
  - **Mastroianni u. a. 2021** (Volltext): 806 + 126 = 932 Gespräche ✓, 1,59 % ≈ 2 % ✓, Abweichung im Mittel 46 % (Labor) bzw. 56 % (Befragung) ✓. **Falsch war:** „Meist wollte einer früher aufhören, der andere später“. Tatsächlich wollten in 46,8 % der Laborgespräche **beide** früher aufhören, in 9,5 % beide länger. Ebenfalls falsch war „auch unter Vertrauten fast nie [zur gemeinsam gewünschten Zeit]“. Studie 1 hat nur den eigenen Wunsch erfasst, ein „gemeinsam“ lässt sich daraus nicht ablesen. Beides ist korrigiert (siehe unten).
  - **Cooney, Gilbert & Wilson 2017:** Sprecher **und** Zuhörer erwarteten, dass Neues besser ankommt. ✓
  - **Dunbar 1997:** 45 Gespräche, etwa zwei Drittel soziale Themen. ✓ **Szala u. a. 2025** (Language and Cognition, Dunbar ist Mitautor): etwa 85 %, also „eher noch mehr“. ✓
  - **Brenner 1973:** Next-in-line-Effekt mit Wörtern, später bestätigt (Bond 1985). ✓
  - **Morris u. a. 2005:** Auf der Feier brachte Abrufen etwa 50 % mehr Namen nach 24–72 Stunden. Die Bild-Merkhilfe war nicht besser als die bloße Anweisung. ✓
  - **Huang u. a. 2017 / Kluger & Malloy 2019 / Yeomans u. a. 2019:** Kritik an der Auswertung der Speed-Dating-Daten, die Autoren antworteten mit neuen Daten. „Richtung gut gestützt, Stärke weniger“ ist fair. ✓
  - **Sandstrom, Boothby & Cooney 2022:** eine Woche Schnitzeljagd. Danach weniger erwartete Ablehnung, mehr Zutrauen, auch eine Woche später. ✓ (Dass es Studierende waren, ist aus dem Gegenlesen von `mut` übernommen.)
  - **Boothby 2018** (Labor, Wohnheim, Workshop), **Collins & Miller 1994** (Meta-Analyse), **Aron 1997**, **Cain 2012** und **Kurtz & Algoe 2015** (Paare): Wiedergabe und Beleg-Stufen passen.
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur smalltalk`. Vorher: 0 Fehler, 0 Hinweise. Nachher: **0 Fehler, 0 Hinweise** (gesamt 0 Fehler). Zusätzlich habe ich mit einem eigenen Zählskript über alle 122 Antwortsätze (Auswahlen, Tests, Dialog- und Lagen-Knoten) gezählt, wo die beste Antwort steht und wie lang sie ist.

## Gesamteindruck

Der Bereich ist fachlich sauber und in der Haltung gut. Smalltalk erscheint als „kleines Angebot von Aufmerksamkeit“, nicht als Prüfung. Stille Menschen werden nicht abgewertet (`w-042` Energie einteilen, `w-082`, `fc-018` „noch ein gutes Gespräch, dann gehen“). Grenzen gelten in beide Richtungen: andere in Ruhe lassen (Kopfhörer, Eile, Bahn und Aufzug) und selbst freundlich gehen dürfen, auch bei Frau Sommer. Manipulationstricks kommen nicht vor, erfundene Ausreden gelten ausdrücklich als schwach (`v-0091`, `v-0096`). Die Mutproben sind privat, und Dienstleistende, die nicht weg können, kommen nicht vor. Die Beleg-Stufen sind ehrlich, die Replikation von Mehl durch Milek ist korrekt eingebaut. Die Musterlösungen in `anschluss`, `spiegeln` und `bauplan` sind durchweg gut und alltagsnah.

Die Mängel lagen woanders:
- **Figuren-Logik über den Kurs hinweg:** Im Sparring stellt sich Jonas als Unbekannter vor, obwohl man in `1-06` schon mit ihm über Persönliches gesprochen hat. Lena hatte zwei Lebensläufe (Hamburg/März und Leipzig/drei Wochen). Außerdem erzählt sie in `1-03` schon in der Mittagspause, während es in `l-01` heißt: „Bisher habt ihr nur ‚Hallo‘ gesagt“. Carla, die Kollegin, wurde als Unbekannte vorgestellt.
- **Wege in Lagen:** In mehreren Knoten passte die Antwort nicht zu jedem Weg dorthin.
- **Eine Studie (Mastroianni) falsch wiedergegeben.**
- **Didaktische Schieflage:** Die beste Antwort ist nur in 14 von 122 Sätzen die längste, das ist gut. Dafür ist eine **falsche** Antwort in 94 von 122 Sätzen (77 %) die längste. Wer das merkt, kann raten (offener Punkt 1).

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| `einheiten-1.json` | `smalltalk-1-07`, Schritt 1 (`schaetzen`, Auflösung) | „Meist wollte einer früher gehen, der andere länger bleiben – und keiner konnte erraten …“ → „Oft wollten sogar beide früher gehen – nur nicht im selben Moment –, und kaum jemand konnte erraten …“ | Mastroianni: In 46,8 % wollten beide früher aufhören. „Keiner“ war zu absolut, im Abstract steht „little idea“. |
| `wissen.json` | `smalltalk-w-013` (Text) | dieselbe falsche Aussage → „Oft wollten sogar beide früher aufhören – nur nicht im selben Moment –, und kaum jemand konnte den Wunsch des anderen erraten.“ | wie oben |
| `wissen.json` | `smalltalk-w-013` (`belegHinweis`) | „Unter Vertrauten endeten Gespräche ebenfalls fast nie zur gemeinsam gewünschten Zeit.“ → „In der Befragung zu Alltagsgesprächen, meist mit Vertrauten, lag das Ende im Schnitt ebenfalls weit neben dem eigenen Wunsch – den Wunsch des Gegenübers hat sie nicht erfasst.“ | Studie 1 hat nur den eigenen Wunsch erfasst. |
| `quellen.json` | `mastroianni2021` | „…; auch unter Vertrauten fast nie.“ → genaue Angaben: rund 30 % endeten, als wenigstens einer es wollte; in knapp der Hälfte wollten beide früher aufhören; in der Befragung (806 Gespräche, meist mit Partner, Familie oder Freunden) wurde nur der eigene Wunsch erfasst | wie oben; `geprueft: true` bleibt, jetzt am Volltext geprüft |
| `quellen.json` | `epley2014` | „Befragte Pendler schätzten …“ → „Befragte (Pendler bzw. Studierende) schätzten …“ | Die Vorhersage-Gruppe in Exp. 3b kam aus einem Teilnehmerpool (Median 21–25 Jahre), nicht aus Pendlern. |
| `einheiten-1.json` | `smalltalk-1-06` (Aha) | „viel seltener peinlich, als wir fürchten … öffnet mehr als jede Faktenfrage“ → „weniger peinlich, als wir fürchten … öffnet meist mehr als eine Faktenfrage“ | Kardas misst, wie peinlich es sich anfühlte, nicht wie oft es peinlich war. „Viel“ und „jede“ gibt die Studie nicht her. |
| `einheiten-1.json` | `smalltalk-1-06`, Schritt 4 (`studie`, Grenze) | „Er schadet also nicht; er ist die Tür.“ → „Er geht also nicht mit Unzufriedenheit einher – er ist die Tür.“ | Aus einem fehlenden Zusammenhang folgt kein „schadet nicht“ als Wirkaussage. Die Grenze soll gerade vor Ursache-Schlüssen warnen. |

(Das sind sieben Zeilen in sechs Sachverhalten: `w-013` hat zwei Felder.)

### Logik der Lagen und Figuren (9)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| `einheiten-1.json` | `smalltalk-1-06-b` (Dialog „Mittagspause mit Jonas“) | Figur Jonas Wegner → **Tarek Yılmaz** (Titel, Figur, Lage, alle „Jonas“ in `k1`, `k2`, `k2b`, `rueck`, `ende1`) | Im Sparring `l-05` stellt sich Jonas als Unbekannter vor („Jonas, aus der Technik … zum ersten Mal auf der Feier“), obwohl man in `1-06` (Kurstag 12) schon mit ihm über Klettern und sein „anstrengendes Jahr“ gesprochen hat. Tarek passt zur sportlichen Figur (Rennrad in `1-07`). So bleibt Jonas im Sparring glaubwürdig neu. |
| `einheiten-1.json` | `smalltalk-1-06-b`, Knoten `k2b` | „Drinnen, in der Halle am Bahnhof.“ → „Meistens drinnen, in der Halle am Bahnhof – da hängt man immer am Seil.“ | Auf dem Weg „Klettern wäre nichts für mich – Höhenangst“ war „Drinnen, in der Halle am Bahnhof“ keine Antwort. Jetzt passt der Satz zu beiden Wegen. |
| `einheiten-1.json` | `smalltalk-1-03-b` (Frage) | „Lena erzählt in der Mittagspause: ‚… seit März … Vorher Hamburg …‘“ → „Eine neue Kollegin aus dem Vertrieb erzählt …“ | Widerspruch zu `l-01` (Kurstag 7): Lena kommt aus Leipzig, ist seit drei Wochen da, und ihr habt „bisher nur ‚Hallo‘ gesagt“. Auch `w-036` sagt Leipzig. |
| `vorrat-01.json` | `smalltalk-v-0025` (beste Antwort) | „Jonas … er klettert. Lena ist seit März bei uns …“ → „Jonas … er spielt Saxofon. Lena ist neu bei uns …“ | passt jetzt zum Sparring (Saxofon) und zu Lenas Lebenslauf |
| `vorrat-01.json` | `smalltalk-v-0043` | „Jule stellt dir eine Freundin vor: ‚Das ist Carla.‘“ → „Jule stellt dir eine Bekannte vor: ‚Das ist Nadine.‘“ (auch die Antworten) | Carla Demir ist laut Besetzung Projektleiterin, also deine Kollegin, und keine Unbekannte. Nadine Köhler ist die Figur, der man glaubwürdig neu begegnet. |
| `lagen-1.json` | `smalltalk-l-01`, Knoten `k3` | „Was mir am meisten fehlt, ist meine Laufgruppe …“ → „Ach, vieles. Am meisten fehlt mir aber meine Laufgruppe …“ | Drei von fünf Wegen kommen mit „Was ist hier am meisten anders?“ oder der Treppenhaus-Anekdote an. Jetzt passt die Antwort zu allen Wegen. |
| `lagen-1.json` | `smalltalk-l-02`, Knoten `k1b` | „wissen Sie, ob der Platz hier noch frei ist?“ / „Ja, ist frei. …“ → „wissen Sie, wie lange das heute ungefähr geht?“ / „Bis neun, steht hier. …“ | Laut Lage sitzt der Vater schon neben dir. Die Frage nach dem freien Platz ergab keinen Sinn. |
| `lagen-1.json` | `smalltalk-l-02`, Knoten `k3` | „Aus dem Norden. Dort gab es …“ → „Wir kommen aus dem Norden. Dort gab es …“ | „Aus dem Norden“ antwortete nur auf „Woher kommen Sie?“ (Weg mit Wert 1), nicht auf die beiden anderen Wege. |
| `lagen-1.json` | `smalltalk-l-05` (Lage) | „Deine Abteilung ist noch nicht da“ → „Der Rest deiner Abteilung ist noch nicht da“ | Lena gehört laut `l-01` zu deinem Team und steht schon im Saal. |

### Sprache und Haltung (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| `wissen.json` | `smalltalk-w-023` (Beispiel) | „Ich bin {name}, ich bin die Nachbarin von Jule.“ → „Ich bin {name}, ich wohne neben Jule.“ | Das Geschlecht des Nutzers ist unbekannt. |
| `vorrat-02.json` | `smalltalk-v-0071` (Muster) | „… wollte ich eigentlich Tierärztin werden.“ → „… wollte ich eigentlich Tiermedizin studieren.“ | wie oben |
| `vorrat-02.json` | `smalltalk-v-0089` (`warum`) | „unterstellst ihm Langeweile“ → „unterstellst dem anderen Langeweile“ | Das Gegenüber ist geschlechtsneutral eingeführt. |
| `wissen.json` | `smalltalk-w-024` | „Ein Aufhänger schlägt jede vorbereitete Frage“ → „trägt meist weiter als eine vorbereitete Frage“ | Superlativ ohne Beleg |
| `wissen.json` | `smalltalk-w-036` | „der eleganteste Abgang“ → „ein besonders eleganter Abgang“ | Superlativ ohne Beleg |
| `wissen.json` | `smalltalk-w-083` | „die älteste Tür der Welt“ → „eine uralte Tür“ | Superlativ ohne Beleg |

**Zusammen: 21 Korrekturen** (6 Fakten, 9 Logik/Figuren, 6 Sprache).

## Offene Punkte (Ermessen, nicht geändert)

1. **Die längste Antwort ist fast immer falsch (wichtigster Punkt).** In 94 von 122 Antwortsätzen ist eine Antwort mit Wert 0 die längste, oft künstlich verlängert („… damit es nicht auffällt“, „… und hoffen, dass …“). Zum Vergleich `konter`: 32 von 64. Die Regel „beste Antwort nicht immer die längste“ ist erfüllt (14 von 122). Das Gegenmuster ist aber genauso ein Ratehinweis. *Empfehlung:* In etwa 30–40 Sätzen die falsche Antwort kürzen oder die brauchbare (Wert 1) bzw. die beste etwas länger machen, vor allem in `tests.json`, wo Raten die Einstufung verfälscht. Bei `fc-001`–`fc-024` ist eine falsche Antwort in 23 von 24 die längste und die beste in keinem einzigen Fall.
2. **Zwei beste Antworten in `l-04`, Knoten `k2b`** („Zwei Minuten hab ich …“ und „Erzählen Sie mir ein andermal mehr …“, beide Wert 2). Das ist inhaltlich richtig, weil beides Grenzen achtet, und in `konter` sechsmal so gemacht. Wenn die Regel „genau eine beste“ auch für Lagen-Knoten gelten soll: das freundliche Gehen auf Wert 2 lassen und „zwei Minuten“ auf Wert 1 setzen. Die Lage lehrt den Abgang, und für stille Nutzer ist das die wichtigere Botschaft.
3. **Nadine Köhler zweimal „zum ersten Mal“:** In `l-03` (Kurstag 14) lernst du sie beim Empfang kennen. In `1-07-b` (Kurstag 16) stellt sie sich wieder vor, mit fast denselben Worten. *Empfehlung:* `1-07-b` als Rückblick fassen („Noch einmal der Empfang: …“) oder als Bekanntschaft auf einer anderen Feier. Dazu kommt ein Mix aus „Sie“ und „ihr“ in der besten Antwort („Freut mich, Frau Köhler. … was baut ihr gerade?“). Besser: „was bauen Sie gerade?“. Auch `w-039` und `w-054` („Freut mich, Nadine.“) duzen eine Figur, die sonst gesiezt wird.
4. **Rolle „Einkauf“ und mögliche Kundin:** In `l-03` soll der Nutzer aus dem Einkauf einer möglichen *Kundin* „unsere neuen Angebote“ zeigen (Antwort mit Wert 0). In `v-0078` fragt er sie, woher sie ihr Holz bezieht, als wäre sie Lieferantin. Das ist nicht falsch, aber unscharf. Eventuell beim Nutzer „Ich bin {name}“ ohne Abteilung lassen oder Nadine dort als mögliche Lieferantin führen. (Das ist eine Änderung in `besetzung.json`, also eine Frage an den Hauptstrang.)
5. **Tests gleichen Übungen:** `fc-017` (Kreis öffnen für jemanden am Rand) gleicht `v-0023` und `l-05/k3` fast wörtlich (beste Antwort „einen halben Schritt zur Seite“). `fc-024` gleicht `v-0041` (gleicher Nachfrage-Satz). *Empfehlung:* Lage und Wortlaut in den Tests abwandeln, z. B. `fc-017` mit einer Sitzgruppe statt einer Stehrunde.
6. **Smalltalk als Werkzeug, nicht als Pflicht:** Die Haltung ist da (`w-042`, `fc-018`, `v-0008`: „Grüßen … ist völlig in Ordnung“). Ein ausdrücklicher Satz für Stille fehlt aber in Kern oder Einleitung, etwa: „Du musst Smalltalk nicht mögen. Er ist ein Werkzeug – du entscheidest, wann du es nimmst.“ (ohne „du musst“ als Befehl). *Empfehlung:* einen Satz in `einleitung` von `wissen.json` oder in die Karte von `1-01`.
7. **Mutprobe `m-10` („bleib, bis du mit drei Menschen gesprochen hast“):** Für Introvertierte ist das ehrgeizig. Laut Konzept ist jede Mission jederzeit abbrechbar. *Empfehlung:* Nachsatz „Wird es dir zu viel, darfst du früher gehen – auch ein Gespräch zählt.“ Die `halb`-Fassung gibt es bereits.
8. **`l-02` Elternabend** setzt voraus, dass der Nutzer Kinder hat. Als Rollenspiel geht das. Falls der Coach später ein Profil kennt, sollte die Lage austauschbar sein (z. B. erster Abend im Verein). Kleinigkeit: `fc-019` duzt eine Mutter beim Elternabend, `l-02` siezt. Beides ist üblich, aber nicht einheitlich.
9. **`l-05`, Knoten `k1`:** Die Antwort mit Wert 0 („abwarten, bis deine Abteilung kommt – dann kennst du wenigstens jemanden“) wirkt etwas schief, weil Lena schon da ist. Sie bleibt als typischer Gedanke vertretbar.
10. **`1-01-a`:** Die brauchbare Antwort („Kommt darauf an – wirkt er beschäftigt, lasse ich ihn, sonst sage ich einen Satz“, Wert 1) ist als Handlung ebenso gut wie die beste Einsicht. Die Frage lautet zwar „Was stimmt am ehesten?“, aber manche Nutzer werden das als zwei richtige Antworten erleben. *Empfehlung:* Frage schärfen: „Welcher Gedanke trifft die Lage am ehesten?“

## Urteil

**Freigabereif: ja.** Die 21 Korrekturen sind eingearbeitet, das Prüfskript meldet 0 Fehler und 0 Hinweise. Vor einer Freigabe für alle sollte Punkt 1 (Längenmuster, besonders in den Tests) nachgearbeitet werden. Die Punkte 2–10 sind Feinschliff.
