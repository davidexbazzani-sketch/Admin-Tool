#!/usr/bin/env python3
# Der Coach — Brunos Aufnahmen NACHMESSEN (Entwicklungswerkzeug; läuft nicht im Tool und kommt nicht ins Setup).
# Claude kann nicht hören – deshalb hört ein Spracherkenner (Whisper „small“, lokal) jede Aufnahme mit:
#   • Sprache: Wie sicher hört er Deutsch? (englisch klingende Stellen fallen auf)
#   • Wortgenauigkeit: Stimmt der gehörte Text mit dem Auftrag überein? (Wortfehlerrate)
#   • Betonung (Hörbeispiele): Ist das GROSS geschriebene Wort das lauteste/höchste der Zeile?
#   • Stimme: mittlere Tonhöhe und Sprechtempo (für die Wahl der Stimme)
#
# Einrichten wie beim Italienischkurs: .tmp-test/italiano/stt-venv (pip install faster-whisper)
#   .tmp-test/italiano/stt-venv/Scripts/python scripts/coach-ton-pruefe.py probe <Datei> "<Text>"
#   .tmp-test/italiano/stt-venv/Scripts/python scripts/coach-ton-pruefe.py pruefe <Rohordner> <auftrag.json>
#       auftrag.json: [{ "name": "gefuehrt-sechzig", "text": "…", "betont": "MÄRZ" (optional) }, …]
# Ergebnis je Datei als Zeile; Grenzen: Deutsch ≥ 0,9, Wortfehler ≤ 8 %, Betonung: Wort auf Platz 1 bei Lautheit ODER Tonhöhe.
import json, re, sys, os
import numpy as np
from faster_whisper import WhisperModel
import av

def decode_audio(datei, sampling_rate=16000):
    """eigene Dekodierung (die von faster-whisper passt nicht zu jeder PyAV-Fassung)"""
    c = av.open(datei)
    r = av.AudioResampler(format="flt", layout="mono", rate=sampling_rate)
    teile = []
    for fr in c.decode(audio=0):
        for x in r.resample(fr): teile.append(x.to_ndarray().reshape(-1))
    for x in r.resample(None): teile.append(x.to_ndarray().reshape(-1))
    c.close()
    return np.concatenate(teile).astype(np.float32)

RATE = 16000
_modell = None
def modell():
    global _modell
    if _modell is None: _modell = WhisperModel("small", device="cpu", compute_type="int8")
    return _modell

def norm(t):
    t = t.lower().replace("ß", "ss")
    t = re.sub(r"[^\wäöü ]", " ", t)
    return [w for w in t.split() if w]

def wer(soll, ist):
    a, b = norm(soll), norm(ist)
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[len(b)] / max(1, len(a))

def grundton(x):
    """Grundton je 40-ms-Fenster per Autokorrelation (70–300 Hz); Median der stimmhaften Fenster"""
    n, hop = 640, 320
    f0 = []
    for i in range(0, len(x) - n, hop):
        s = x[i:i + n]
        if np.sqrt(np.mean(s * s)) < 0.02: continue
        s = s - s.mean()
        ac = np.correlate(s, s, "full")[n - 1:]
        lo, hi = RATE // 300, RATE // 70
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] / (ac[0] + 1e-9) > 0.5: f0.append(RATE / k)
    return f0

def miss(datei, text, betont=None):
    x = decode_audio(datei, sampling_rate=RATE)
    segs, info = modell().transcribe(x, language=None, word_timestamps=True, beam_size=5)
    segs = list(segs)
    gehoert = " ".join(s.text.strip() for s in segs)
    p_de = dict(info.all_language_probs or []).get("de", 0.0)
    f0 = grundton(x)
    woerter = [w for s in segs for w in (s.words or [])]
    dauer = len(x) / RATE
    aus = {"datei": os.path.basename(datei), "p_de": round(p_de, 3), "wer": round(wer(text, gehoert), 3),
           "f0": round(float(np.median(f0)), 1) if f0 else None, "woerter_je_s": round(len(woerter) / max(0.1, dauer), 2),
           "gehoert": gehoert}
    if betont:
        # Lautheit und Tonhöhe je Wort; das betonte Wort sollte vorn liegen
        werte = []
        for w in woerter:
            s = x[int(w.start * RATE):int(w.end * RATE)]
            if len(s) < 400: continue
            lr = float(10 * np.log10(np.mean(s * s) + 1e-10))
            f = grundton(s)
            werte.append((norm(w.word)[0] if norm(w.word) else "", lr, max(f) if f else 0))
        ziel = norm(betont)[0]
        laut = sorted(werte, key=lambda v: -v[1]); hoch = sorted(werte, key=lambda v: -v[2])
        platz_l = next((i + 1 for i, v in enumerate(laut) if v[0] == ziel), None)
        platz_h = next((i + 1 for i, v in enumerate(hoch) if v[0] == ziel), None)
        aus["betont"] = {"wort": ziel, "platz_lautheit": platz_l, "platz_tonhoehe": platz_h,
                         "ok": (platz_l == 1 or platz_h == 1)}
    aus["ok"] = p_de >= 0.9 and aus["wer"] <= 0.08 and (aus.get("betont", {}).get("ok", True))
    return aus

if __name__ == "__main__":
    modus = sys.argv[1]
    if modus == "probe":
        print(json.dumps(miss(sys.argv[2], sys.argv[3]), ensure_ascii=False))
    elif modus == "pruefe":
        ordner, auftrag = sys.argv[2], json.load(open(sys.argv[3], encoding="utf-8"))
        fehler = 0
        for a in auftrag:
            datei = next((os.path.join(ordner, a["name"] + e) for e in (".mp3", ".wav", ".ogg") if os.path.exists(os.path.join(ordner, a["name"] + e))), None)
            if not datei: print(f"{a['name']}: FEHLT"); fehler += 1; continue
            r = miss(datei, re.sub(r"[A-ZÄÖÜ]{2,}", lambda m: m.group(0).capitalize(), a["text"]), a.get("betont"))
            fehler += 0 if r["ok"] else 1
            b = r.get("betont")
            print(f"{'OK  ' if r['ok'] else 'FEHL'} {a['name']:<28} de {r['p_de']:.2f}  wer {r['wer']:.2f}  f0 {r['f0']}" + (f"  betont {b['wort']}: L{b['platz_lautheit']} H{b['platz_tonhoehe']}" if b else "") + (f"  | {r['gehoert']}" if not r['ok'] else ""))
        print(f"{len(auftrag) - fehler}/{len(auftrag)} in Ordnung")
        sys.exit(1 if fehler else 0)
