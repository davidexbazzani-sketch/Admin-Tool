#!/usr/bin/env python3
# Parla Italiano — Aufnahmen teilen und NACHMESSEN (Entwicklungswerkzeug; läuft nicht im Tool und kommt nicht ins Setup).
#
# Warum es das gibt (24.11.2026): Die Sprachausgabe hat keine Sprach-Einstellung. Einzelne Wörter, die es auch im
# Englischen gibt (zero, due, no, male, fare …), sprach sie englisch aus; und beim Teilen der Dialoge nach Pausenlänge
# landeten an vielen Lerntagen ein, zwei Wörter einer Zeile im Nachbarstück. Beides hört man — aber niemand kann 120
# Lerntage durchhören. Dieses Werkzeug lässt deshalb einen Spracherkenner (Whisper, läuft lokal) mithören:
#   • Welche Sprache hört er in einem Stück? (englisch klingende Wörter finden)
#   • Wo endet eine Dialogzeile wirklich? (Wörter mit Zeitmarken dem Text zuordnen, Grenze in die Pause dort legen)
#   • Steht jedes Wort im richtigen Stück? (jedes Stück für sich hören; bei Verdacht zusätzlich alles am Stück)
#
# Einrichten (einmal):   py -m venv .tmp-test/italiano/stt-venv
#                        .tmp-test/italiano/stt-venv/Scripts/python -m pip install faster-whisper
#                        (beim ersten Lauf lädt es das Modell „small“, rund 480 MB, in den Benutzerordner)
#
#   python scripts/italiano-ton-pruefe.py woerter <von> <bis>   Wortlisten (ton-roh/tNNN-w.*) teilen und messen
#                                                               → ton-roh/tNNN-w.schnitt.json
#   python scripts/italiano-ton-pruefe.py dialoge <von> <bis>   Dialoge (ton-roh/tNNN-d.*) teilen und prüfen
#                                                               → ton-roh/tNNN-d.schnitt.json
#   python scripts/italiano-ton-pruefe.py ersatz                einzeln neu vertonte Dialogzeilen (ton-roh/tNNN-eZZ.*, Liste in
#                                                               scripts/italiano-ton-ersatz.json) teilen, hören, mit dem
#                                                               bisherigen Stück vergleichen → ton-roh/tNNN-eZZ.schnitt.json
#   python scripts/italiano-ton-pruefe.py fertig  <von> <bis> [woerter|dialoge|nurbau]
#                                                               die fertigen Tondateien (public/italiano/ton + zeiten.json)
#                                                               gegenprüfen: jedes Wort, jede Zeile. „nurbau“ hört nichts,
#                                                               sondern gleicht nur Tondatei und Schnittdateien ab (Sekunden)
#   python scripts/italiano-ton-pruefe.py selbsttest            die Regeln dieses Werkzeugs an bekannten Fällen prüfen (ohne Erkenner)
# Danach baut  npx electron scripts/italiano-ton.cjs baue .tmp-test/italiano/ton-roh  die Tondateien mit diesen
# Schnittstellen. Auffälligkeiten stehen in ton-roh/pruefbericht.tsv, alle Messwerte in ton-roh/messwerte.tsv
# (beide werden angehängt).
#
# Schalter (Umgebung):  PI_FAEDEN=2   Zahl der Rechenfäden (wenig, wenn der PC nebenbei anderes tun soll)
#                       PI_WARTE=20   so viele Minuten auf eine noch fehlende Aufnahme warten
#                       PI_NEU=1      auch Lerntage neu teilen, die schon eine gültige Schnittdatei haben
#                       PI_ROH=…      anderer Ordner für die Roh-Aufnahmen · PI_MODELL=small
#
# Grenzen der Messung: Wörter, die in beiden Sprachen fast gleich klingen (sei/„say“, blu/„blue“, mai/„my“, sì/„see“),
# hält der Erkenner oft für englisch, obwohl sie richtig sind — das sind keine Fehler. Eindeutig ist die Messung dort,
# wo sich die Aussprachen unterscheiden (zero, due, male, fare, stare, dare, con, non, alto …).
import difflib, functools, json, math, os, re, sys, time, unicodedata
import numpy as np

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROH = os.environ.get('PI_ROH') or os.path.join(WURZEL, '.tmp-test', 'italiano', 'ton-roh')
TON = os.path.join(WURZEL, 'public', 'italiano', 'ton')
ZEITEN = os.path.join(WURZEL, 'src', 'italiano', 'ton', 'zeiten.json')
RATE = 16000
MODELL = os.environ.get('PI_MODELL', 'small')
NEU = os.environ.get('PI_NEU') == '1'

# ── Ton lesen ──
def lies_ton(pfad):
    """Tondatei → Mono-Abtastwerte (float32) mit 16 kHz"""
    import av
    teile = []
    with av.open(pfad) as c:
        res = av.AudioResampler(format='s16', layout='mono', rate=RATE)
        for frame in c.decode(c.streams.audio[0]):
            for f in res.resample(frame):
                teile.append(f.to_ndarray().reshape(-1))
        for f in res.resample(None):
            teile.append(f.to_ndarray().reshape(-1))
    return np.concatenate(teile).astype(np.float32) / 32768.0

def tag_inhalt(tag):
    level = (tag - 1) // 5 + 1
    with open(os.path.join(WURZEL, 'src', 'italiano', 'inhalt', f'level-{level:02d}.json'), encoding='utf-8') as f:
        return next(t for t in json.load(f)['tage'] if t['tag'] == tag)

def roh_datei(tag, art):
    for e in ('mp3', 'wav', 'ogg', 'm4a'):
        f = os.path.join(ROH, f't{tag:03d}-{art}.{e}')
        if os.path.exists(f):
            return f
    return None

def warte_auf(tag, art):
    """die Roh-Aufnahme eines Lerntags. Mit PI_WARTE=<Minuten> wird auf eine fehlende gewartet (wenn die Aufnahmen
    gerade erst geholt werden) — und in jedem Fall, bis die Datei fertig geschrieben ist."""
    ende = time.time() + 60 * float(os.environ.get('PI_WARTE', 0))
    while True:
        f = roh_datei(tag, art)
        if f and time.time() - os.path.getmtime(f) >= 3: return f
        if not f and time.time() >= ende: return None
        time.sleep(3)

def lies_schnitt(tag, art, anzahl):
    """gültige Schnittdatei zu einer Roh-Aufnahme (dieselben Regeln wie in italiano-ton.cjs), sonst None"""
    f, roh = os.path.join(ROH, f't{tag:03d}-{art}.schnitt.json'), roh_datei(tag, art)
    if not roh or not os.path.exists(f) or os.path.getmtime(f) < os.path.getmtime(roh): return None
    try:
        with open(f, encoding='utf-8') as d: s = json.load(d)
        st = s.get('stuecke')
        if not isinstance(st, list) or len(st) != anzahl or not all(isinstance(x, list) and len(x) == 2 and x[1] > x[0] for x in st): return None
        return s
    except Exception:
        return None

def schreibe_schnitt(tag, art, stuecke, geprueft, **mehr):
    with open(os.path.join(ROH, f't{tag:03d}-{art}.schnitt.json'), 'w', encoding='utf-8') as f:
        json.dump({'stuecke': [[round(a, 3), round(b, 3)] for a, b in stuecke], 'geprueft': bool(geprueft), **mehr}, f)

# ── Text vergleichen (der Erkenner schreibt „24“, im Text steht „ventiquattro“) ──
EINER = {'zero': 0, 'uno': 1, 'una': 1, 'un': 1, 'due': 2, 'tre': 3, 'quattro': 4, 'cinque': 5, 'sei': 6, 'sette': 7, 'otto': 8, 'nove': 9, 'dieci': 10,
         'undici': 11, 'dodici': 12, 'tredici': 13, 'quattordici': 14, 'quindici': 15, 'sedici': 16, 'diciassette': 17, 'diciotto': 18, 'diciannove': 19}
ZEHNER = {'venti': 20, 'trenta': 30, 'quaranta': 40, 'cinquanta': 50, 'sessanta': 60, 'settanta': 70, 'ottanta': 80, 'novanta': 90}
ZEHNER_KURZ = {k[:-1]: v for k, v in ZEHNER.items()}        # ventuno, trent'anni: der Endvokal fällt weg

@functools.lru_cache(maxsize=None)
def zahl(wort):
    """italienisches Zahlwort (oder Ziffern) → Zahl, sonst None"""
    if wort.isdigit(): return int(wort)
    if wort in EINER: return EINER[wort]
    for teil in ('mila', 'mille'):
        if teil in wort:
            vor, _, nach = wort.partition(teil)
            v = 1 if vor == '' else zahl(vor)
            n = 0 if nach == '' else zahl(nach)
            return None if v is None or n is None else v * 1000 + n
    if 'cento' in wort:
        vor, _, nach = wort.partition('cento')
        v = 1 if vor == '' else EINER.get(vor)
        n = 0 if nach == '' else zahl(nach)
        return None if v is None or n is None else v * 100 + n
    for z, wert in list(ZEHNER.items()) + list(ZEHNER_KURZ.items()):
        if wort.startswith(z):
            rest = wort[len(z):]
            if rest == '': return wert
            if rest in EINER and EINER[rest] < 10: return wert + EINER[rest]
    return None

def normal(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = s.replace("'", ' ').replace('’', ' ')
    s = re.sub(r'(?<=\d)[. ](?=\d{3}(?!\d))', '', s)        # „2.000“ / „2 000“ ist EIN Wort (duemila)
    return re.sub(r'[^a-z0-9 ]+', ' ', s).split()

def fasse_zahlen(erkannt):
    """gehörte Wörter mit Zeitmarken: „2“ + „000“ zu „2000“ zusammenziehen (der Erkenner liefert Tausender in zwei Teilen)"""
    aus = []
    for w, v, b in erkannt:
        if aus and re.fullmatch(r'\d{3}', w) and re.fullmatch(r'\d{1,3}', aus[-1][0]) and v - aus[-1][2] < 0.3: aus[-1] = (aus[-1][0] + w, aus[-1][1], b)
        else: aus.append((w, v, b))
    return aus

@functools.lru_cache(maxsize=None)
def aehnlich(a, b):
    if a == b: return 1.0
    za, zb = zahl(a), zahl(b)
    if za is not None and za == zb: return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()

def paare(soll, ist, heim=None):
    """Zwei Wortfolgen aufeinander legen (die Reihenfolge bleibt): Liste der Paare (Ort im Soll, Ort im Ist).
    heim(i, j): dieses Paar leicht bevorzugen (bei Gleichstand gewinnt die Zuordnung im eigenen Stück)."""
    n, m = len(soll), len(ist)
    D = np.full((n + 1, m + 1), 1e9)
    B = np.zeros((n + 1, m + 1), dtype=np.int8)
    D[0, 0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if i == 0 and j == 0: continue
            best, wie = 1e9, 0
            if i > 0 and j > 0:
                c = D[i - 1, j - 1] + (1.0 - 0.9 * aehnlich(soll[i - 1], ist[j - 1])) - (0.05 if heim and heim(i - 1, j - 1) else 0.0)
                if c < best: best, wie = c, 1
            if i > 0 and D[i - 1, j] + 0.7 < best: best, wie = D[i - 1, j] + 0.7, 2
            if j > 0 and D[i, j - 1] + 0.7 < best: best, wie = D[i, j - 1] + 0.7, 3
            D[i, j], B[i, j] = best, wie
    aus, i, j = [], n, m
    while i > 0 or j > 0:
        wie = B[i, j]
        if wie == 1: aus.append((i - 1, j - 1)); i -= 1; j -= 1
        elif wie == 2: i -= 1
        else: j -= 1
    aus.reverse()
    return aus

def verteilt(texte, gehoert):
    """Steht jedes Wort im richtigen Stück? texte[k] = erwarteter Text des Stücks k, gehoert[k] = was der Erkenner in
    diesem Stück versteht. Ergebnis: die Wörter im falschen Stück als (k, Wort, Stück, in dem es gehört wurde); je
    Stück der Anteil seiner eigenen Wörter, die in ihm gehört wurden; und je Stück, ob sein erstes und sein letztes
    Wort in ihm stehen (bei einem falschen Schnitt sind es genau die Randwörter, die im Nachbarstück landen). Ein
    Randwort gilt auch dann als vorhanden, wenn es nur verhört wurde („Zia“ → „si“): Dann wurden im Stück trotzdem
    so viele Wörter gehört, wie hineingehören. Fehlt es wirklich, fehlt auch ein Wort in der Zählung."""
    E = [(k, i, w) for k, t in enumerate(texte) for i, w in enumerate(normal(t))]
    G = [(j, w) for j, t in enumerate(gehoert) for w in normal(t)]
    anzahl = [len(normal(t)) for t in texte]
    gehoert_n = [len(normal(t)) for t in gehoert]
    fremd, eigen, da = [], [0] * len(texte), [set() for _ in texte]
    for ei, gj in paare([w for _, _, w in E], [w for _, w in G], lambda i, j: E[i][0] == G[j][0]):
        k, ort, wort = E[ei]
        nah = aehnlich(wort, G[gj][1])
        if k == G[gj][0]:
            if nah >= 0.6: da[k].add(ort)
            if nah >= 0.7: eigen[k] += 1
        elif nah >= 0.7: fremd.append((k, wort, G[gj][0]))
    for k in range(len(texte)):
        soll, ist = normal(texte[k]), normal(gehoert[k])
        if len(soll) > 1 and ist:
            # Randwort mit seinem Nachbarn zu EINEM Wort verschmolzen gehört („in contanti“ → „incontanti“)? Nur, wenn das
            # gehörte Wort länger ist als das Nachbarwort allein — sonst gälte ein fehlendes „E“ vor „dove“ als vorhanden.
            if len(ist[0]) > len(soll[1]) and aehnlich(soll[0] + soll[1], ist[0]) >= 0.8: da[k].add(0)
            if len(ist[-1]) > len(soll[-2]) and aehnlich(soll[-2] + soll[-1], ist[-1]) >= 0.8: da[k].add(len(soll) - 1)
            # Kurzes Randwort (e, i, a, è, ho …): Der Erkenner verhört den Vokal („E a Napoli“ → „I Anapoli“) oder hängt
            # ihn ans Nachbarwort („I soldi“ → „Assoldi“). Vorhanden ist es, wenn am Rand ein ebenso kurzes Wort steht,
            # das NICHT schon das Nachbarwort ist, oder wenn das Nachbarwort um einen Vorschlag länger gehört wurde.
            # Fehlt es wirklich, steht am Rand das Nachbarwort selbst, unverlängert — das bleibt eine Meldung.
            if len(soll[0]) <= 2 and ((len(ist[0]) <= 2 and aehnlich(ist[0], soll[1]) < 0.6) or (len(ist[0]) > len(soll[1]) and aehnlich(ist[0][-len(soll[1]):], soll[1]) >= 0.8)): da[k].add(0)
            if len(soll[-1]) <= 2 and ((len(ist[-1]) <= 2 and aehnlich(ist[-1], soll[-2]) < 0.6) or (len(ist[-1]) > len(soll[-2]) and aehnlich(ist[-1][:len(soll[-2])], soll[-2]) >= 0.8)): da[k].add(len(soll) - 1)
    voll = [gehoert_n[k] >= anzahl[k] for k in range(len(texte))]
    return fremd, [eigen[k] / max(1, anzahl[k]) for k in range(len(texte))], [(0 in da[k] or voll[k], anzahl[k] - 1 in da[k] or voll[k]) for k in range(len(texte))]

# ── Pausen ──
def ruhen(pcm, mind=0.06):
    """Anfang und Ende der Sprache, dazu alle Pausen dazwischen (von, bis) in Sekunden — wie in italiano-ton-seite.js"""
    n = RATE // 100
    m = len(pcm) // n
    x = pcm[:m * n].reshape(m, n).astype(np.float64)
    h = np.sqrt((x * x).mean(axis=1))
    laut = np.sort(h)[int(len(h) * 0.95)] if len(h) else 0.0
    schwelle = max(0.0035, laut * 0.045)
    a, b = 0, len(h) - 1
    while a < len(h) and h[a] < schwelle: a += 1
    while b > a and h[b] < schwelle: b -= 1
    liste, von = [], -1
    for f in range(a, b + 1):
        if h[f] < schwelle:
            if von < 0: von = f
        elif von >= 0:
            if (f - von) / 100 >= mind: liste.append((von / 100, f / 100))
            von = -1
    return a / 100, (b + 1) / 100, liste

# ── der Erkenner ──
class Pruefer:
    def __init__(self):
        from faster_whisper import WhisperModel
        from faster_whisper.tokenizer import Tokenizer
        self.m = WhisperModel(MODELL, device='cpu', compute_type='int8', cpu_threads=int(os.environ.get('PI_FAEDEN', 0)) or max(4, (os.cpu_count() or 8) - 2))
        self.tok = Tokenizer(self.m.hf_tokenizer, True, task='transcribe', language='it')

    def sprache(self, pcm, laenge=30, rahmen=400):
        """EIN Stück für sich hören: Welche Sprache hört das Modell, und was versteht es (auf Italienisch)? Kurzes
        Fenster statt der üblichen 30 s: für einzelne Wörter und Sätze reicht das und geht siebenmal so schnell.
        laenge: wie viele Wortteile höchstens (einzelnes Wort 30, ganze Dialogzeile 120). Ab 60 schreibt das Modell
        mit Zeitmarken mit — ohne sie hört es nach dem ersten Satz gern auf („… non sono qui?“ statt „… qui? Due? Tre?“)."""
        from faster_whisper.audio import pad_or_trim
        ruhe = np.zeros(int(RATE * 0.35), dtype=np.float32)
        f = self.m.feature_extractor(np.concatenate([ruhe, pcm.astype(np.float32), ruhe]))
        rahmen = min(3000, max(rahmen, int(math.ceil(f.shape[-1] / 100.0)) * 100))
        enc = self.m.encode(pad_or_trim(f, rahmen))
        p = {s[2:-2]: w for s, w in self.m.model.detect_language(enc)[0]}
        top = max(p.items(), key=lambda kv: kv[1])
        t = self.tok
        # (Wiederholungs-Sperre: bei kurzem Fenster dreht sich das Modell sonst gelegentlich im Kreis)
        r = self.m.model.generate(enc, [list(t.sot_sequence) + ([] if laenge >= 60 else [t.no_timestamps])], beam_size=1, max_length=laenge, suppress_blank=True, repetition_penalty=1.3, no_repeat_ngram_size=2)[0]
        ids = r.sequences_ids[0]
        if laenge >= 60:
            # Mit Zeitmarken schreibt das Modell Abschnitt für Abschnitt: <von> Text <bis>. Ist der Ton zu Ende, hört es
            # nicht immer auf, sondern wiederholt den Satz verstümmelt. Solche Abschnitte beginnen erst, wenn der Ton
            # vorbei ist (oder springen in der Zeit zurück) — sie werden verworfen.
            sprach_ende = 0.35 + len(pcm) / RATE
            behalten, abschnitt, beginn, letzte = [], [], None, 0.0
            for i in list(ids) + [t.timestamp_begin + 1500]:
                if i >= t.timestamp_begin:
                    zeit = (i - t.timestamp_begin) * 0.02
                    if abschnitt:
                        if beginn is not None and (beginn > sprach_ende - 0.15 or beginn < letzte - 0.3): break
                        behalten += abschnitt; abschnitt = []; letzte = min(zeit, sprach_ende); beginn = None
                    else: beginn = zeit
                elif i < t.eot: abschnitt.append(i)
            ids = behalten
        return {'p_it': p.get('it', 0.0), 'p_en': p.get('en', 0.0), 'top': top[0], 'p_top': top[1], 'hyp': t.decode([i for i in ids if i < t.eot]).strip()}

    def erkenne(self, pcm, versatz=0.0):
        """einen ganzen Abschnitt am Stück hören: die gesprochenen Wörter mit Zeitmarken [(wort, von, bis)]"""
        segmente, _ = self.m.transcribe(pcm, language='it', word_timestamps=True, beam_size=5, condition_on_previous_text=False, temperature=0.0, vad_filter=False)
        aus = []
        for s in segmente:
            for w in (s.words or []):
                teile = normal(w.word)
                for i, teil in enumerate(teile):      # ein erkanntes „Wort“ kann mehrere enthalten (l'anno)
                    aus.append((teil, versatz + w.start + (w.end - w.start) * i / len(teile), versatz + w.start + (w.end - w.start) * (i + 1) / len(teile)))
        return aus

englisch = lambda r: r['p_en'] > 0.5 and r['p_en'] > r['p_it']
# Laute, die der Erkenner oft gar nicht mitschreibt (kein Wort im engeren Sinn)
EINWURF = {'mmm', 'mm', 'mh', 'hm', 'hmm', 'mhm', 'eh', 'ehm', 'ah', 'oh', 'uh', 'uff', 'boh', 'beh', 'mah', 'bah', 'ahi', 'ohi', 'ops', 'psst', 'sst', 'shh'}

def im_stueck(erkannt, a, b):
    return ' '.join(w for w, v, bb in erkannt if a - 0.02 <= (v + bb) / 2 <= b + 0.02)

def kurze_saetze(pr, pcm, text, erkannt, a, b):
    """Kurze Sätze (höchstens zwei Wörter) INNERHALB einer längeren Zeile einzeln messen — „No! La pagina è …“,
    „Due? Tre?“: Solche Einwürfe spricht die Sprachausgabe am ehesten englisch. Ergebnis: [(Satz, Messung)], nur für
    Sätze, deren Wörter der Erkenner alle wiedergefunden hat (sonst ist nicht sicher, wo sie liegen)."""
    saetze = [s.strip() for s in re.split(r'(?<=[.!?…])\s+', text) if s.strip()]
    if len(saetze) < 2: return []
    drin = [(w, v, bb) for w, v, bb in erkannt if a - 0.02 <= (v + bb) / 2 <= b + 0.02]
    soll = [(i, w) for i, s in enumerate(saetze) for w in normal(s)]
    zeit = {}
    for ei, gj in paare([w for _, w in soll], [w for w, _, _ in drin]):
        if aehnlich(soll[ei][1], drin[gj][0]) >= 0.6: zeit.setdefault(soll[ei][0], []).append((drin[gj][1], drin[gj][2]))
    aus = []
    for i, s in enumerate(saetze):
        n = len(normal(s))
        if n == 0 or n > 2 or len(zeit.get(i, [])) != n: continue
        aus.append((s, pr.sprache(pcm[int(max(a, zeit[i][0][0] - 0.08) * RATE):int(min(b, zeit[i][-1][1] + 0.08) * RATE)])))
    return aus

# ── Teilen ──
def gehoert(pr, tag, art, pcm):
    """Die Roh-Aufnahme am Stück gehört: Wörter mit Zeitmarken. Das Hören ist der teure Teil — das Ergebnis liegt
    deshalb neben der Aufnahme (tNNN-x.gehoert.json) und wird wiederverwendet, solange die Aufnahme nicht jünger ist."""
    f, roh = os.path.join(ROH, f't{tag:03d}-{art}.gehoert.json'), roh_datei(tag, art)
    erkannt = None
    if os.path.exists(f) and os.path.getmtime(f) >= os.path.getmtime(roh):
        try:
            with open(f, encoding='utf-8') as d: erkannt = [(w, float(v), float(b)) for w, v, b in json.load(d)]
        except Exception:
            erkannt = None
    frisch = erkannt is None
    if frisch: erkannt = pr.erkenne(pcm)
    erkannt, gefuellt = fuelle_luecken(pr, pcm, erkannt)
    if frisch or gefuellt:
        with open(f, 'w', encoding='utf-8') as d: json.dump([[w, round(v, 3), round(b, 3)] for w, v, b in erkannt], d, ensure_ascii=False)
    return fasse_zahlen(erkannt)

def fuelle_luecken(pr, pcm, erkannt):
    """Der Erkenner lässt gelegentlich ein Stück aus — vor allem das Ende einer Aufnahme, die länger als sein Fenster
    von 30 s ist. Jede Lücke (mehr als 2 s ohne erkanntes Wort, in denen aber über 1 s gesprochen wird) wird noch
    einmal für sich gehört. Ergebnis: die vervollständigte Liste und ob etwas dazukam."""
    anfang, ende, pausen = ruhen(pcm)
    dazu = False
    for _ in range(4):
        erkannt = sorted(erkannt, key=lambda w: w[1])
        kanten = [anfang] + [x for w in erkannt for x in (w[1], w[2])] + [ende]
        luecke = None
        for i in range(0, len(kanten), 2):
            a, b = kanten[i], kanten[i + 1]
            if b - a <= 2.0: continue
            # an den Rändern der Lücke auf die nächste Pause gehen, damit kein Nachbarwort angeschnitten mitgehört wird
            vorn = [pb for pv, pb in pausen if a - 0.3 <= pv and pb <= b]
            a2 = min(vorn) if i and vorn else a
            hinten = [pv for pv, pb in pausen if a2 <= pv and pb <= b + 0.3]
            b2 = max(hinten) if i + 2 < len(kanten) and hinten else b
            ruhe = sum(min(pb, b2) - max(pv, a2) for pv, pb in pausen if pb > a2 and pv < b2)
            if b2 - a2 - ruhe > 1.0: luecke = (a2, b2); break
        if not luecke: break
        neu = pr.erkenne(pcm[int(max(0.0, luecke[0] - 0.15) * RATE):int((luecke[1] + 0.15) * RATE)], max(0.0, luecke[0] - 0.15))
        if not neu: break
        erkannt, dazu = erkannt + neu, True
    return sorted(erkannt, key=lambda w: w[1]), dazu

def ordne(einheiten, erkannt):
    """Erwartete Wörter (je Einheit) den erkannten zuordnen. Je Einheit die Zeiten ihrer Wörter [(von, bis) …] in der
    Reihenfolge des Sprechens (leer = nichts davon erkannt), dazu die Güte 0…1 (Anteil der wiedererkannten Wörter)."""
    E = [(k, w) for k, text in enumerate(einheiten) for w in normal(text)]
    zeiten, treffer = [[] for _ in einheiten], 0
    for ei, rj in paare([w for _, w in E], [w for w, _, _ in erkannt]):
        if aehnlich(E[ei][1], erkannt[rj][0]) >= 0.6: treffer += 1
        zeiten[E[ei][0]].append((erkannt[rj][1], erkannt[rj][2]))
    return zeiten, treffer / max(1, len(E))

def schneide(pcm, einheiten, erkannt):
    """Eine Aufnahme mithörend in len(einheiten) Stücke teilen (erkannt = die gehörten Wörter mit Zeitmarken).
    Die Grenze zwischen zwei Einheiten ist die Pause, die am meisten Zeit zwischen dem letzten Wort der einen und dem
    ersten Wort der nächsten einnimmt, gemessen von Wortmitte zu Wortmitte. Nicht die Pause, die den Zeitmarken am
    nächsten liegt: Die Zeitmarken verrutschen (vor allem bei Zahlen) um Zehntelsekunden, und dann gewann ein
    Verschlusslaut mitten im Wort („cinquan|ta“) gegen die halbe Sekunde Pause gleich daneben.
    Ergebnis (dict): stuecke [(von, bis)], guete der Zuordnung, hinweise (harte Auffälligkeiten; leer = in Ordnung),
    zweifel (Grenzen, an denen zwei Pausen in Frage kommen — das klärt die Hörprobe), grenzen (die gewählten Pausen),
    wahl (je Grenze alle Pausen, die in Frage kommen, die beste zuerst), anfang, ende."""
    anfang, ende, pausen = ruhen(pcm)
    zeiten, guete = ordne(einheiten, erkannt)
    hinweise, zweifel, n = [], [], len(einheiten)
    for k in range(n):
        if not zeiten[k]:
            hinweise.append(f'Einheit {k} nicht erkannt')
            vor = next((zeiten[x][-1][1] for x in range(k - 1, -1, -1) if zeiten[x]), anfang)
            nach = next((zeiten[x][0][0] for x in range(k + 1, n) if zeiten[x]), ende)
            zeiten[k] = [(vor + (nach - vor) * 0.25, vor + (nach - vor) * 0.75)]
    mitte = lambda w: (w[0] + w[1]) / 2
    grenzen, wahl = [], []
    for k in range(n - 1):
        a, b = mitte(zeiten[k][-1]), mitte(zeiten[k + 1][0])
        if a >= b:
            hinweise.append(f'Zeitmarken an der Grenze {k}/{k + 1} überlappen')
            a, b = (a + b) / 2 - 0.3, (a + b) / 2 + 0.3
        # je Pause: wie viel von ihr liegt zwischen den beiden Wortmitten, wie lang ist sie, von, bis
        w = sorted(((min(pb, b) - max(pv, a), pb - pv, pv, pb) for (pv, pb) in pausen if pb > a and pv < b), reverse=True)
        if not w:
            hinweise.append(f'keine Pause zwischen Einheit {k} und {k + 1}')
            grenzen.append(((a + b) / 2 - 0.005, (a + b) / 2 + 0.005)); wahl.append([grenzen[-1]])
            continue
        if len(w) > 1 and w[1][0] >= 0.12 and w[0][0] < 1.5 * w[1][0]:
            zweifel.append((k, f'Grenze {k}/{k + 1}: zwei Pausen ({w[0][0] * 1000:.0f} und {w[1][0] * 1000:.0f} ms) zwischen den Nachbarwörtern'))
        if w[0][1] < 0.12: hinweise.append(f'Grenze {k}/{k + 1} in sehr kurzer Pause ({w[0][1] * 1000:.0f} ms)')
        grenzen.append((w[0][2], w[0][3]))
        wahl.append([(x[2], x[3]) for x in w if x[0] >= 0.12 or x is w[0]])
    for k in range(1, len(grenzen)):
        if grenzen[k][0] <= grenzen[k - 1][0]: hinweise.append(f'Grenzen {k - 1}/{k} nicht aufsteigend')
    return {'stuecke': stuecke_aus(anfang, ende, grenzen), 'guete': guete, 'hinweise': hinweise, 'zweifel': zweifel, 'grenzen': grenzen, 'wahl': wahl, 'anfang': anfang, 'ende': ende}

def stuecke_aus(anfang, ende, grenzen):
    """aus den Grenzpausen die Stücke: jedes reicht vom Ende der einen Pause bis zum Anfang der nächsten"""
    stuecke, start = [], anfang
    for (pv, pb) in grenzen:
        stuecke.append((start, pv)); start = pb
    stuecke.append((start, ende))
    return stuecke

def nach_reihenfolge(einheiten, erkannt):
    """die am Stück gehörten Wörter nicht nach ihrer Zeit, sondern nach ihrer Reihenfolge auf die Einheiten verteilen
    (in Wortlisten mit langen Pausen rutschen die Zeitmarken des Erkenners oft in die Pause davor)"""
    E = [(k, w) for k, text in enumerate(einheiten) for w in normal(text)]
    aus = [[] for _ in einheiten]
    for ei, rj in paare([w for _, w in E], [w for w, _, _ in erkannt]): aus[E[ei][0]].append(erkannt[rj][0])
    return [' '.join(x) for x in aus]

def schneide_liste(pcm, anzahl):
    """Eine Wortliste an den anzahl-1 längsten Pausen teilen. Sicherheit: kürzeste gewählte / längste nicht gewählte Pause"""
    anfang, ende, pausen = ruhen(pcm)
    if len(pausen) < anzahl - 1: return None, 0.0
    nach_laenge = sorted(pausen, key=lambda p: p[1] - p[0], reverse=True)
    wahl, rest = sorted(nach_laenge[:anzahl - 1]), nach_laenge[anzahl - 1:]
    kurz = min(p[1] - p[0] for p in wahl) if wahl else 9.0
    lang = max([p[1] - p[0] for p in rest] + [0.03])
    stuecke, start = [], anfang
    for (pv, pb) in wahl:
        stuecke.append((start, pv)); start = pb
    stuecke.append((start, ende))
    return stuecke, kurz / lang

# ── Bericht ──
class Bericht:
    def __init__(self, was):
        os.makedirs(ROH, exist_ok=True)
        self.f = open(os.path.join(ROH, 'pruefbericht.tsv'), 'a', encoding='utf-8')
        self.w = open(os.path.join(ROH, 'messwerte.tsv'), 'a', encoding='utf-8')
        self.was, self.zahl = was, 0
    def melde(self, tag, nr, art, text, info):
        self.zahl += 1
        z = f'{self.was}\t{tag}\t{nr}\t{art}\t{text}\t{info}'
        self.f.write(z + '\n'); self.f.flush()
        print('   ' + z, flush=True)
    def wert(self, tag, teil, nr, text, dauer, r):
        self.w.write(f"{self.was}\t{tag}\t{teil}\t{nr}\t{text}\t{dauer:.2f}\t{r['p_it']:.3f}\t{r['p_en']:.3f}\t{r['top']}\t{r['p_top']:.3f}\t{r['hyp']}\n"); self.w.flush()

def hoerprobe(pr, br, tag, teil, texte, pcm, stuecke, laenge, grenze, erkannt=None, rand=0.0, ganz=None, leise=False, reihenfolge=False, dazu=None):
    """Jedes Stück FÜR SICH hören (unabhängig von Zeitmarken): Klingt es englisch? Steht ein Wort im falschen Stück?
    Fehlt einem Stück sein Text? Bei Verdacht kommt eine zweite Hörprobe dazu — der ganze Abschnitt am Stück, die
    Wörter nach ihrer Zeit auf die Stücke verteilt (erkannt, falls schon vorhanden; oder fertig verteilt in ganz).
    Ein fehlender Text wird nur gemeldet, wenn BEIDE Hörproben ihn nicht finden (ebenso ein fehlendes erstes oder
    letztes Wort einer Zeile); ein verschobenes Wort schon, wenn eine es hört.
    rand: so viel Ton vor und nach jedem Stück mithören (Roh-Aufnahme: 0,05 s — genau das, was der Bau übernimmt).
    leise: nichts melden, nur zählen (zum Ausprobieren einer anderen Grenze).
    reihenfolge: die am Stück gehörten Wörter nach ihrer Reihenfolge statt nach ihrer Zeit verteilen (Wortlisten: dort
    rutschen die Zeitmarken des Erkenners in die Pausen).
    dazu: eine dritte Stimme je Stück (was beim Teilen in der Roh-Aufnahme an dieser Stelle gehört wurde). Sie kann nur
    entlasten: Ein Text oder Randwort gilt als vorhanden, wenn EINE der Stimmen es hört — der Erkenner lässt ein kurzes
    „Ha“ am Zeilenanfang mal mitschreiben und mal nicht. Verschobene Wörter meldet sie nicht.
    Ergebnis: Zahl der englisch klingenden Stücke, der verschobenen Wörter, der Stücke ohne ihren Text oder Rand."""
    einzeln = []
    for nr, (a, b) in enumerate(stuecke):
        r = pr.sprache(pcm[int(max(0.0, a - rand) * RATE):int((b + rand) * RATE)], laenge)
        einzeln.append(r)
        if not leise: br.wert(tag, teil, nr, texte[nr], b - a, r)
    # Was der Erkenner über die erwartete Länge hinaus „hört“, ist fast immer eine Wiederholung des Satzes (er hört am
    # Ende des Tons nicht immer auf). Drei Wörter Überhang bleiben stehen: So viel hängt bei einem falschen Schnitt
    # höchstens vom Nachbarn an — und genau das soll auffallen.
    kappe = lambda hyp, text: ' '.join(normal(hyp)[:len(normal(text)) + 3])
    fremd1, eigen1, rand1 = verteilt(texte, [kappe(r['hyp'], texte[nr]) for nr, r in enumerate(einzeln)])
    fremd2, eigen2, rand2 = [], None, None
    if ganz is not None or fremd1 or any(e < grenze for e in eigen1) or not all(x and y for x, y in rand1) or erkannt is not None:
        if ganz is None:
            if erkannt is None:
                a0 = max(0.0, stuecke[0][0] - 0.3)
                erkannt = fasse_zahlen(pr.erkenne(pcm[int(a0 * RATE):int((stuecke[-1][1] + 0.3) * RATE)], a0))
            ganz = nach_reihenfolge(texte, erkannt) if reihenfolge else [im_stueck(erkannt, a, b) for a, b in stuecke]
        fremd2, eigen2, rand2 = verteilt(texte, ganz)
    if leise:
        return (sum(1 for r in einzeln if englisch(r)), len(set(fremd1) | set(fremd2)),
                sum(1 for nr in range(len(texte)) if eigen2 is not None and ((eigen1[nr] < grenze and eigen2[nr] < grenze) or (len(normal(texte[nr])) > 1 and
                    ((not rand1[nr][0] and not rand2[nr][0]) or (not rand1[nr][1] and not rand2[nr][1]))))))
    n_e = n_v = n_u = 0
    for nr, r in enumerate(einzeln):
        if englisch(r):
            # Gegenmessung mit etwas mehr und etwas weniger Rand: Bei kurzen Stücken schwankt die Sprach-Erkennung um
            # einige Zehntel — gemeldet wird nur, was in zwei von drei Messungen englisch klingt.
            a, b = stuecke[nr]
            mehr = [pr.sprache(pcm[int(max(0.0, a - rand - x) * RATE):int((b + rand + x) * RATE)], laenge) for x in (0.06, -0.03)]
            if sum(1 for x in mehr if englisch(x)) == 0: continue
            n_e += 1
            br.melde(tag, nr, 'englisch', texte[nr], f"{teil}: en {r['p_en']:.2f}/{mehr[0]['p_en']:.2f}/{mehr[1]['p_en']:.2f} it {r['p_it']:.2f} «{r['hyp']}»" + (f' / am Stück gehört «{ganz[nr]}»' if ganz else ''))
    for (k, wort, j) in sorted(set(fremd1) | set(fremd2)):
        n_v += 1
        wer = 'beide Hörproben' if (k, wort, j) in fremd1 and (k, wort, j) in fremd2 else 'nur einzeln gehört' if (k, wort, j) in fremd1 else 'nur am Stück gehört'
        br.melde(tag, k, 'verschoben', texte[k], f"{teil}: «{wort}» steht in Stück {j} ({wer}) · einzeln «{einzeln[j]['hyp']}»" + (f' · am Stück «{ganz[j]}»' if ganz else ''))
    eigen3, rand3 = (verteilt(texte, dazu)[1:] if dazu is not None else (None, None))
    for nr in range(len(texte)):
        if eigen2 is None: break
        beides = f"einzeln gehört «{einzeln[nr]['hyp']}», am Stück «{ganz[nr]}»" + (f', beim Teilen «{dazu[nr]}»' if dazu is not None else '')
        vorn = not rand1[nr][0] and not rand2[nr][0] and (rand3 is None or not rand3[nr][0])
        hinten = not rand1[nr][1] and not rand2[nr][1] and (rand3 is None or not rand3[nr][1])
        if eigen1[nr] < grenze and eigen2[nr] < grenze and (eigen3 is None or eigen3[nr] < grenze):
            n_u += 1
            br.melde(tag, nr, 'inhalt', texte[nr], f'{teil}: {beides}')
        elif len(normal(texte[nr])) > 1 and (vorn or hinten):
            wo = ' und '.join(x for x, fehlt in (('erstes', vorn), ('letztes', hinten)) if fehlt)
            w = normal(texte[nr])
            if (not vorn or w[0] in EINWURF) and (not hinten or w[-1] in EINWURF):
                # „Mmm“, „Eh …“: Solche Laute schreibt der Erkenner oft gar nicht mit — kein Fehler, nur ein Hinweis
                # (bei Zweifel von Hand ansehen: Liegt am Anfang des Stücks Ton vor der ersten Pause?)
                br.melde(tag, nr, 'einwurf', texte[nr], f'{teil}: «{w[0] if vorn else w[-1]}» am Rand nicht mitgeschrieben · {beides}')
                continue
            n_u += 1
            br.melde(tag, nr, 'rand', texte[nr], f'{teil}: {wo} Wort in keiner Hörprobe in diesem Stück · {beides}')
    return n_e, n_v, n_u

# ── Wortlisten (ein Abschnitt je Lerntag) ──
def woerter(pr, von, bis):
    br, alle, engl, offen = Bericht('woerter'), 0, 0, []
    for tag in range(von, bis + 1):
        datei = warte_auf(tag, 'w')
        if not datei: print(f'Tag {tag}: keine Aufnahme', flush=True); offen.append(tag); continue
        liste = [w['it'] for w in tag_inhalt(tag)['woerter']]
        if not NEU and (lies_schnitt(tag, 'w', len(liste)) or {}).get('geprueft') is True: print(f'Tag {tag}: schon geteilt und geprüft (PI_NEU=1 teilt neu)', flush=True); continue
        try:
            pcm = lies_ton(datei)
            erkannt = gehoert(pr, tag, 'w', pcm)
            sp, sicher = schneide_liste(pcm, len(liste))
            s = schneide(pcm, liste, erkannt)
            sw, guete, hinweise = s['stuecke'], s['guete'], s['hinweise'] + [z for _, z in s['zweifel']]
            # zwei Wege zum Schnitt — die längsten Pausen und das Mithören — sollen dasselbe ergeben
            einig = bool(sp) and all(abs(a[0] - b[0]) < 0.08 and abs(a[1] - b[1]) < 0.08 for a, b in zip(sp, sw))
            gut, ganz = True, None
            if einig: stuecke = sp
            elif sp and sicher >= 1.5:
                # Klare Pausen gewinnen: Zwischen den Wörtern einer Liste liegt immer eine deutlich längere Pause als in
                # einem Wort, die Zeitmarken des Erkenners rutschen dort dagegen oft in die Pause davor. Stück k ist dann
                # das k-te Wort — die zweite Hörprobe zählt deshalb nach der Reihenfolge, nicht nach der Zeit.
                stuecke, ganz = sp, nach_reihenfolge(liste, erkannt)
                if os.environ.get('PI_GENAU'): br.melde(tag, -1, 'schnitt', '', f'Zeitmarken des Mithörens passen nicht zu den Pausen (Zuordnung {guete:.2f}) -> Pausen, sie sind eindeutig ({sicher:.1f})')
            elif not hinweise and guete >= 0.9:
                stuecke = sw
                br.melde(tag, -1, 'schnitt', '', f'Pausen nicht eindeutig ({sicher:.1f}) -> Mithören (Zuordnung {guete:.2f})')
            else:
                stuecke, gut = (sp or sw), False
                br.melde(tag, -1, 'schnitt', '', f'UNSICHER: Pausen-Sicherheit {sicher:.1f}, Zuordnung {guete:.2f}, {"; ".join(hinweise)}')
            n_e, n_v, n_u = hoerprobe(pr, br, tag, 'w', liste, pcm, stuecke, 30, 0.5, erkannt, 0.05, ganz)
            for nr, (a, b) in enumerate(stuecke):
                if b - a < 0.18 or b - a > 3.5:
                    gut = False
                    br.melde(tag, nr, 'laenge', liste[nr], f'{b - a:.2f} s')
            if n_v or n_u: gut = False
            alle += len(liste); engl += n_e
            if not gut: offen.append(tag)
            print(f'Tag {tag}: {len(liste)} Wörter, {len(pcm) / RATE:.1f} s, Pausen-Sicherheit {sicher:.1f}, Zuordnung {guete:.2f}, einig {einig}, englisch klingend {n_e}, {"gut" if gut else "NACHSEHEN"}', flush=True)
            schreibe_schnitt(tag, 'w', stuecke, gut, sicher=round(sicher, 2), guete=round(guete, 3))
        except Exception as e:
            offen.append(tag)
            br.melde(tag, -1, 'fehler', '', repr(e))
    print(f'\n{alle} Wörter, {engl} englisch klingend, {br.zahl} Meldungen · nachsehen: {offen or "nichts"}')

# ── Dialoge ──
def dialoge(pr, von, bis):
    br, offen = Bericht('dialoge'), []
    zeiten_alt = json.load(open(ZEITEN, encoding='utf-8')) if os.path.exists(ZEITEN) else {}
    for tag in range(von, bis + 1):
        datei = warte_auf(tag, 'd')
        if not datei: print(f'Tag {tag}: keine Aufnahme', flush=True); offen.append(tag); continue
        zeilen = [z['it'] for z in tag_inhalt(tag)['dialog']['zeilen']]
        if not NEU and (lies_schnitt(tag, 'd', len(zeilen)) or {}).get('geprueft') is True: print(f'Tag {tag}: schon geteilt und geprüft (PI_NEU=1 teilt neu)', flush=True); continue
        try:
            pcm = lies_ton(datei)
            erkannt = gehoert(pr, tag, 'd', pcm)
            s = schneide(pcm, zeilen, erkannt)
            guete, hinweise, grenzen = s['guete'], s['hinweise'], list(s['grenzen'])
            for h in hinweise: br.melde(tag, -1, 'schnitt', '', h)
            # Wo zwei Pausen in Frage kommen, entscheidet die Hörprobe: die beiden Nachbarzeilen mit jeder der Pausen
            # als Grenze hören — es gilt die, bei der jedes Wort in seiner Zeile steht.
            for k, text in s['zweifel']:
                def probleme(g):
                    a = s['anfang'] if k == 0 else grenzen[k - 1][1]
                    b = s['ende'] if k + 2 >= len(zeilen) else grenzen[k + 1][0]
                    if not (a < g[0] and g[1] < b): return 99
                    _, v, u = hoerprobe(pr, br, tag, 'd', zeilen[k:k + 2], pcm, [(a, g[0]), (g[1], b)], 120, 0.6, erkannt, 0.05, leise=True)
                    return v + u
                wert = [(probleme(g), i) for i, g in enumerate(s['wahl'][k])]
                if min(wert)[1] != 0:
                    grenzen[k] = s['wahl'][k][min(wert)[1]]
                    br.melde(tag, k, 'schnitt', zeilen[k], f'{text} -> die Hörprobe wählt die andere Pause ({wert[0][0]} gegen {min(wert)[0]} Auffälligkeiten)')
                elif os.environ.get('PI_GENAU'): br.melde(tag, k, 'schnitt', zeilen[k], f'{text} -> von der Hörprobe bestätigt')
            stuecke = stuecke_aus(s['anfang'], s['ende'], grenzen)
            kurz = min([g[1] - g[0] for g in grenzen] + [9.0])
            n_e, n_v, n_u = hoerprobe(pr, br, tag, 'd', zeilen, pcm, stuecke, 120, 0.6, erkannt, 0.05)
            alt, anders = (zeiten_alt.get(str(tag)) or {}).get('d') or [], 0
            for nr, (a, b) in enumerate(stuecke):
                if nr < len(alt) and alt[nr] and abs((alt[nr][1] - alt[nr][0]) - ((b - a) + 0.1)) > 0.25: anders += 1
            # kurze Sätze innerhalb längerer Zeilen („Due? Tre?“, „No! La pagina è …“): klingt einer davon englisch?
            for nr, text in enumerate(zeilen):
                for satz, r in kurze_saetze(pr, pcm, text, erkannt, *stuecke[nr]):
                    br.wert(tag, 's', nr, satz, 0, r)
                    if englisch(r): br.melde(tag, nr, 'englisch-satz', satz, f"en {r['p_en']:.2f} it {r['p_it']:.2f} «{r['hyp']}» in «{text}»")
            gut = not hinweise and not n_v and not n_u
            if not gut: offen.append(tag)
            print(f'Tag {tag}: {len(zeilen)} Zeilen, {len(pcm) / RATE:.1f} s, Zuordnung {guete:.2f}, kürzeste Grenzpause {kurz * 1000:.0f} ms, Zeilen anders als im heutigen Stand: {anders}, {"gut" if gut else "NACHSEHEN"}', flush=True)
            schreibe_schnitt(tag, 'd', stuecke, gut, guete=round(guete, 3), kurz=round(kurz, 3))
        except Exception as e:
            offen.append(tag)
            br.melde(tag, -1, 'fehler', '', repr(e))
    print(f'\n{br.zahl} Meldungen · nachsehen: {offen or "nichts"}')

# ── einzeln neu vertonte Dialogzeilen (scripts/italiano-ton-ersatz.json) ──
def ersatz_stueck(tag, nr):
    """das geprüfte Ersatzstück einer Dialogzeile oder None — dieselbe Regel wie beim Bau (italiano-ton.cjs)"""
    s = lies_schnitt(tag, f'e{nr:02d}', 1)
    return tuple(s['stuecke'][0]) if s and s.get('geprueft') is True else None

def ersatz(pr):
    """Jede Ersatz-Aufnahme teilen (Hilfssätze fallen weg), für sich hören und mit dem bisherigen Stück vergleichen."""
    br = Bericht('ersatz')
    with open(os.path.join(WURZEL, 'scripts', 'italiano-ton-ersatz.json'), encoding='utf-8') as f: liste = json.load(f).get('zeilen', {})
    for schluessel in sorted(liste, key=lambda k: [int(x) for x in k.split('/')]):
        tag, nr = (int(x) for x in schluessel.split('/'))
        e, art = liste[schluessel], f'e{nr:02d}'
        datei = roh_datei(tag, art)
        zeilen = [z['it'] for z in tag_inhalt(tag)['dialog']['zeilen']]
        if not datei: print(f'Tag {tag} Zeile {nr}: noch keine Aufnahme', flush=True); continue
        if not NEU and ersatz_stueck(tag, nr): print(f'Tag {tag} Zeile {nr}: schon geprüft (PI_NEU=1 prüft neu)', flush=True); continue
        try:
            pcm = lies_ton(datei)
            einheiten = [x for x in (e.get('vor'), zeilen[nr], e.get('nach')) if x]
            ort = 1 if e.get('vor') else 0
            erkannt = gehoert(pr, tag, art, pcm)
            if len(einheiten) == 1:
                a, b, _ = ruhen(pcm)
                stuecke, hinweise = [(a, b)], []
            else:
                s = schneide(pcm, einheiten, erkannt)
                stuecke, hinweise = s['stuecke'], s['hinweise'] + [z for _, z in s['zweifel']]
            for h in hinweise: br.melde(tag, nr, 'schnitt', zeilen[nr], h)
            _, n_v, n_u = hoerprobe(pr, br, tag, art, einheiten, pcm, stuecke, 120, 0.6, erkannt, 0.05)
            a, b = stuecke[ort]
            neu = pr.sprache(pcm[int(max(0.0, a - 0.05) * RATE):int((b + 0.05) * RATE)], 120)
            saetze_neu = dict((x, r) for x, r in kurze_saetze(pr, pcm, zeilen[nr], erkannt, a, b))
            # zum Vergleich: dieselbe Zeile in der Dialog-Aufnahme
            alt, saetze_alt, haupt, s_alt = None, {}, roh_datei(tag, 'd'), lies_schnitt(tag, 'd', len(zeilen))
            if haupt and s_alt:
                x, y = s_alt['stuecke'][nr]
                p = lies_ton(haupt)
                alt = pr.sprache(p[int(max(0.0, x - 0.05) * RATE):int((y + 0.05) * RATE)], 120)
                saetze_alt = dict((k, r) for k, r in kurze_saetze(pr, p, zeilen[nr], gehoert(pr, tag, 'd', p), x, y))
            # Übernommen wird nur, was messbar besser ist: die Zeile (oder ein kurzer Satz darin) klang englisch und
            # klingt jetzt nicht mehr so — und nichts klingt jetzt englisch, was vorher nicht so klang.
            besser = bool(alt and englisch(alt)) or any(englisch(r) and k in saetze_neu and not englisch(saetze_neu[k]) for k, r in saetze_alt.items())
            schlechter = englisch(neu) or any(englisch(r) and not (k in saetze_alt and englisch(saetze_alt[k])) for k, r in saetze_neu.items())
            gut = not hinweise and not n_v and not n_u and besser and not schlechter
            satzbild = ' · '.join(f"«{k}» en {saetze_alt[k]['p_en']:.2f} → " + (f"{saetze_neu[k]['p_en']:.2f}" if k in saetze_neu else '?') for k in saetze_alt)
            print(f'Tag {tag} Zeile {nr} «{zeilen[nr]}»: ' + (f"bisher en {alt['p_en']:.2f} «{alt['hyp']}» · " if alt else '')
                  + f"jetzt en {neu['p_en']:.2f} «{neu['hyp']}»" + (f' · kurze Sätze: {satzbild}' if satzbild else '') + f" · {b - a:.2f} s · "
                  + ('ÜBERNOMMEN' if gut else 'nicht übernommen (' + ('Schnitt/Text prüfen' if hinweise or n_v or n_u else 'klingt jetzt englisch' if schlechter else 'nicht messbar besser') + ')'), flush=True)
            schreibe_schnitt(tag, art, [(a, b)], gut, en=round(neu['p_en'], 3), en_bisher=round(alt['p_en'], 3) if alt else None, text=' '.join(x for x in (e.get('vor'), e.get('text') or zeilen[nr], e.get('nach')) if x))
        except Exception as fehler:
            br.melde(tag, nr, 'fehler', '', repr(fehler))

# ── die fertigen Tondateien gegenprüfen ──
def fertig(pr, von, bis, teil):
    br, zeiten = Bericht('fertig'), json.load(open(ZEITEN, encoding='utf-8'))
    summe = {'w': [0, 0, 0, 0], 'd': [0, 0, 0, 0]}        # Stücke, englisch, verschoben, ohne ihren Text
    bau, offen = 0, []
    for tag in range(von, bis + 1):
        z, t = zeiten.get(str(tag)), tag_inhalt(tag)
        datei = os.path.join(TON, f't{tag:03d}.ogg')
        if not z or not os.path.exists(datei):
            bau += 1; offen.append(tag); br.melde(tag, -1, 'bau', '', 'Tondatei oder Zeitmarken fehlen'); continue
        texte = {'w': [w['it'] for w in t['woerter']], 'd': [x['it'] for x in t['dialog']['zeilen']]}
        vorher = bau
        # 1. Bau: Ist die Tondatei jünger als alles, woraus sie entsteht? (Eine zweite Fassung derselben Liste hat fast
        #    gleich lange Stücke — an den Längen allein fällt eine veraltete Tondatei nicht auf.)
        quellen = [roh_datei(tag, 'w'), roh_datei(tag, 'd')] + [os.path.join(ROH, f't{tag:03d}-{a}.schnitt.json') for a in ('w', 'd')]
        for nr in range(len(texte['d'])):      # (nur übernommene Ersatzzeilen — die anderen nimmt der Bau nicht)
            if ersatz_stueck(tag, nr): quellen += [roh_datei(tag, f'e{nr:02d}'), os.path.join(ROH, f't{tag:03d}-e{nr:02d}.schnitt.json')]
        juenger = [os.path.basename(q) for q in quellen if q and os.path.exists(q) and os.path.getmtime(q) > os.path.getmtime(datei)]
        if juenger:
            bau += 1; br.melde(tag, -1, 'bau', '', f'Tondatei ist älter als {", ".join(juenger)} — neu bauen')
        #    Und liegt jedes Stück so in der Datei, wie die geprüften Schnittstellen es vorgeben?
        for art in ('w', 'd'):
            s = lies_schnitt(tag, art, len(texte[art]))
            if len(z[art]) != len(texte[art]) or not all(z[art]):
                bau += 1; br.melde(tag, -1, 'bau', '', f'{art}: Zeitmarken unvollständig')
            elif s is None:
                bau += 1; br.melde(tag, -1, 'bau', '', f'{art}: keine gültige Schnittdatei zur Roh-Aufnahme')
            else:
                for nr, ((a, b), (x, y)) in enumerate(zip(s['stuecke'], z[art])):
                    e = ersatz_stueck(tag, nr) if art == 'd' else None      # einzeln neu vertonte Zeile: ihr Stück gilt
                    if abs((y - x) - ((e[1] - e[0] if e else b - a) + 0.1)) > 0.06:
                        bau += 1; br.melde(tag, nr, 'bau', texte[art][nr], f"{art}: Stück {y - x:.2f} s lang, nach {'Ersatz-' if e else ''}Schnittdatei {(e[1] - e[0] if e else b - a) + 0.1:.2f} s")
                    if nr and a - s['stuecke'][nr - 1][1] < 0.1:      # eine Grenze mitten im Wort wäre eine winzige Pause
                        bau += 1; br.melde(tag, nr, 'bau', texte[art][nr], f"{art}: die Grenze vor diesem Stück liegt in einer Pause von nur {(a - s['stuecke'][nr - 1][1]) * 1000:.0f} ms")
        if z.get('ds') != 1:
            bau += 1; br.melde(tag, -1, 'bau', '', 'Dialogzeilen nicht als sicher getrennt vermerkt (ds)')
        # 2. Hören: jedes Wort, jede Zeile
        pcm = lies_ton(datei)
        zeile = [f'Tag {tag}:']
        schlecht = bau > vorher
        for art, name, laenge, grenze in (('w', 'woerter', 30, 0.5), ('d', 'dialoge', 120, 0.6)):
            if teil not in ('alles', name) or len(z[art]) != len(texte[art]) or not all(z[art]): continue
            # dritte Stimme für die Dialogzeilen: was beim Teilen in der Roh-Aufnahme in diesem Stück gehört wurde
            dazu, s, g = None, lies_schnitt(tag, 'd', len(texte['d'])), os.path.join(ROH, f't{tag:03d}-d.gehoert.json')
            if art == 'd' and s and os.path.exists(g) and os.path.getmtime(g) >= os.path.getmtime(roh_datei(tag, 'd')):
                with open(g, encoding='utf-8') as d: roh_w = fasse_zahlen([(w, float(v), float(b)) for w, v, b in json.load(d)])
                dazu = ['' if ersatz_stueck(tag, nr) else im_stueck(roh_w, a, b) for nr, (a, b) in enumerate(s['stuecke'])]
            n_e, n_v, n_u = hoerprobe(pr, br, tag, art, texte[art], pcm, [tuple(x) for x in z[art]], laenge, grenze, reihenfolge=(art == 'w'), dazu=dazu)
            for i, n in enumerate((len(texte[art]), n_e, n_v, n_u)): summe[art][i] += n
            zeile.append(f'{"Wörter" if art == "w" else "Zeilen"} {len(texte[art])} (englisch klingend {n_e}, verschoben {n_v}, ohne ihren Text {n_u})')
            schlecht = schlecht or n_v > 0 or n_u > 0
        if schlecht: offen.append(tag)
        print(' '.join(zeile) + (' · NACHSEHEN' if schlecht else ''), flush=True)
    w, d = summe['w'], summe['d']
    print(f'\n{w[0]} Wörter: {w[1]} englisch klingend, {w[2]} verschoben, {w[3]} ohne ihren Text · {d[0]} Dialogzeilen: {d[1]} englisch klingend, '
          f'{d[2]} Wörter im falschen Stück, {d[3]} ohne ihren Text · Bau: {bau} Abweichungen · nachsehen: {offen or "nichts"}')

# ── Selbsttest der Regeln (ohne Erkenner, sofort fertig) ──
def selbsttest():
    """Die Regeln, mit denen aus dem Gehörten auf „Wort fehlt“ / „Wort verschoben“ geschlossen wird, an bekannten Fällen
    prüfen — jeder davon ist am 24.11.2026 an echten Aufnahmen vorgekommen. Nach jeder Änderung an verteilt() ausführen."""
    faelle = [      # Name, Text des Stücks, was der Erkenner hörte, ist das erste UND das letzte Wort vorhanden?
        ('verhört, aber vorhanden (Zia → si)', 'Zia Elena! Ciao! Come stai?', 'si Elena ciao come stai', True),
        ('verschmolzen gehört (in contanti)', 'in contanti', 'incontanti', True),
        ('ans Nachbarwort gehängt (I soldi → Assoldi)', 'I soldi non mi interessano, signore.', 'Assoldi non mi interessano signore', True),
        ('Vokal verhört (E a Napoli → I Anapoli)', 'E a Napoli avevi trovato lavoro.', 'I Anapoli avevi trovato lavoro', True),
        ('Zahl in Ziffern (Ventiquattro → 24)', 'No, Ben. Ventiquattro!', 'no ben 24', True),
        ('Tausender in zwei Teilen (Duemila → 2 000)', 'Duemila? Tremila? Ancora no?', '2 000 3.000 ancora no', True),
        ('FEHLT vorn: E', 'E dove sono?', 'dove sono', False),
        ('FEHLT vorn: E (danach ein kurzes Wort)', 'E tu, quanti anni hai?', 'tu quanti anni hai', False),
        ('FEHLT vorn: Duemila', 'Duemila? Tremila? Ancora no? Ho fretta, Giulia!', '3000 ancora no offretta giulia', False),
        ('FEHLT hinten: Tre', 'E quante pagine non sono qui? Due? Tre?', 'e quante pagine non sono qui due', False),
    ]
    ok = 0
    for name, text, hoert, soll in faelle:
        _, _, rand = verteilt([text], [hoert])
        ist = rand[0][0] and rand[0][1]
        ok += ist == soll
        print(('ok      ' if ist == soll else 'FALSCH  ') + name)
    # der Fall vom Lerntag 4: drei Zeilen, jede um ein Stück verrutscht
    fremd, _, _ = verteilt(['E quante pagine non sono qui? Due? Tre?', 'No, Ben. Ventiquattro!', 'Ventiquattro pagine? E dove sono?'], ['e quante pagine non sono qui due', 'tre no ben', '24 24 pagine'])
    gut = (0, 'tre', 1) in fremd and (1, 'ventiquattro', 2) in fremd
    ok += gut
    print(('ok      ' if gut else 'FALSCH  ') + f'verschobene Wörter erkannt: {fremd}')
    # eine Wiederholung am Ende des Gehörten darf kein verschobenes Wort vortäuschen (gekappt wird in hoerprobe)
    texte = ['La pagina non costa niente. E io non vendo niente a nessuno.', 'Allora la pagina non è per nessuno?']
    hoert = ['la pagina non costa niente e io non vendo niente a', 'allora la pagina non e per nessuno la paginata non ha per nessuno allora la pagine non e per nessuno']
    fremd, _, _ = verteilt(texte, [' '.join(normal(h)[:len(normal(t)) + 3]) for h, t in zip(hoert, texte)])
    ok += not fremd
    print(('ok      ' if not fremd else 'FALSCH  ') + f'Wiederholung täuscht nichts vor: {fremd}')
    z = [zahl('ottantaquattro') == 84, zahl('sessant') == 60, zahl('duemila') == 2000, zahl('ventuno') == 21, zahl('casa') is None, fasse_zahlen([('2', 1.0, 1.2), ('000', 1.2, 1.5)]) == [('2000', 1.0, 1.5)]]
    ok += all(z)
    print(('ok      ' if all(z) else 'FALSCH  ') + f'Zahlwörter: {z}')
    print(f'{ok} von {len(faelle) + 3} Proben in Ordnung')
    return ok == len(faelle) + 3

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'selbsttest': sys.exit(0 if selbsttest() else 1)
    if len(sys.argv) > 1 and sys.argv[1] == 'ersatz': ersatz(Pruefer()); sys.exit(0)
    if len(sys.argv) < 4 or sys.argv[1] not in ('woerter', 'dialoge', 'fertig'):
        print('Aufruf: italiano-ton-pruefe.py woerter|dialoge|fertig <von> <bis>  ·  italiano-ton-pruefe.py ersatz   (siehe Kopf der Datei)'); sys.exit(2)
    von, bis = int(sys.argv[2]), int(sys.argv[3])
    if sys.argv[1] == 'woerter': woerter(Pruefer(), von, bis)
    elif sys.argv[1] == 'dialoge': dialoge(Pruefer(), von, bis)
    else: fertig(Pruefer(), von, bis, sys.argv[4] if len(sys.argv) > 4 else 'alles')
