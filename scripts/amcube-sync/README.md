# AMCube-Sync (Chiron Backup)

Dieses Skript kopiert die Daten der Chiron-AMCube-Anlagen (3D-Drucker) automatisch auf den Server **w3294**. Es läuft dort als geplante Aufgabe. Das IT Admin Tool richtet es ein, steuert es und zeigt den Stand in der Kachel **„Chiron Backup“** (Infrastruktur → Back-Ups).

| Anlage | Hostname  | IP             | Quelle                               | Ziel (unter `D:\Chiron\<Stamm>\`) |
|--------|-----------|----------------|--------------------------------------|-----------------------------------|
| 550-01 | 550-01sim | 10.170.32.145  | `\\10.170.32.145\Daten\dataline_am`  | `875_550-01`                      |
| 550-04 | 550-04sim | 10.170.33.53   | `\\10.170.33.53\Daten\dataline_am`   | `885_550-04`                      |
| 550-05 | 550-05sim | 10.170.33.110  | `\\10.170.33.110\Daten\dataline_am`  | `890_550-05`                      |
| 550-03 | 550-03sim | –              | (noch nicht angebunden, deaktiviert) | `870_550-03`                      |

## So arbeitet es

**Richtung und Löschen**
- Der Sync läuft nur in eine Richtung: von der Anlage zum Server.
- Auf dem Server wird **nie gelöscht**. Es gibt kein `/MIR` und kein `/PURGE`.
- Eine Datei, die im Ziel **neuer** ist als auf der Anlage, wird nicht überschrieben (`/XO`).

**robocopy**
- Aufruf: `robocopy /E /Z /FFT /XO /R:2 /W:10 /NP /XJ /MT:8`, dazu ein Protokoll je Lauf und Anlage.
- Exitcodes 0–7 gelten als Erfolg, ab 8 als Fehler.

**Zeitplan und Nachholen**
- Feste Zeitslots, Standard **06:00 und 18:00**.
- Die Aufgabe läuft **stündlich** und **beim Systemstart**. Je Anlage gilt: Ist seit dem letzten *erfolgreichen* Sync ein Slot vergangen, wird synchronisiert.
- Ist eine Anlage aus, wird sie übersprungen (Port 445, 2 s Wartezeit) und eine Stunde später erneut versucht. So wird automatisch nachgeholt.

**Doppelstart:** Ein Mutex (`Global\AMCubeSync`) verhindert, dass zwei Läufe gleichzeitig laufen. Stürzt ein Lauf ab, gibt Windows die Sperre automatisch frei.

**Schutz des Ziels**
- Das Skript schreibt **ausschließlich** in `D:\Chiron\<targetRoot>\<Zielordner>`.
- Als `targetRoot` sind nur `02_Serienproduktion_Test` und `02_Serienproduktion` erlaubt.
- Jeder Zielpfad wird geprüft: kein `..`, genau eine Ebene unter dem Stamm. `00_Archiv`, `03_Lohnfertigung` usw. werden nie angefasst.
- Vor jedem Lauf prüft das Skript per `Get-SmbShare -Name Chiron`, ob die Freigabe noch auf `basePath` zeigt. Sonst bricht es mit einer Meldung ab.

**Speicherplatz**
- Fällt der freie Platz unter `minFreeGB` (Standard 10 GB), wird nicht kopiert, und es kommt eine Meldung.
- Vor dem **ersten** Lauf in ein Ziel ermittelt das Skript zusätzlich mit `robocopy /L` den Bedarf. Reicht der Platz nicht, startet der Lauf nicht.

## Dateien auf w3294

`C:\ProgramData\AMCubeSync\`. Nur SYSTEM und Administratoren haben Zugriff.

| Datei | Inhalt |
|---|---|
| `AMCubeSync.ps1` | das Skript (läuft auch ohne Tool) |
| `config.json` | Anlagen, Zeitslots, Ziel, Mindestplatz, **ohne Passwort** (Vorlage: `config.example.json`) |
| `status.json` | Stand je Anlage, wird vom Tool gelesen |
| `verlauf.jsonl` | eine Zeile je Lauf und Anlage (Start, Ende, Dauer, Ergebnis, Dateien, Bytes, Exitcode) |
| `aktionen.jsonl` | wer wann was getan hat (Einrichten, Aufträge, Passwort gesetzt, Umschalten) |
| `logs\` | robocopy-Protokolle und Skript-Protokoll; älter als 90 Tage wird gelöscht |
| `auftraege\` | Aufträge vom Tool (Jetzt ausführen, Probelauf, Vergleich, Größe) und deren Ergebnisse |
| `secret.bin` | Passwort von skf1, per DPAPI (LocalMachine) verschlüsselt |
| `schluessel.json` | öffentlicher Schlüssel, mit dem das Tool ein neues Passwort verschlüsselt |

Die geplante Aufgabe heißt `\SKF\AMCubeSync`. Sie läuft als SYSTEM, damit kein Benutzerpasswort gespeichert werden muss. Auf w3294 ist das Speichern von Anmeldedaten gesperrt.

## Einrichtung (über das Tool)

1. Back-Ups → **„Chiron Backup“** anlegen. Die Kachel hat schon die drei Anlagen und 550-03 (deaktiviert).
2. **„Auf Server einrichten“**. Das Tool versucht zuerst WinRM, sonst `\\w3294\C$` mit `schtasks /S`. Es kopiert Skript und Konfiguration, setzt die Ordnerrechte, legt die Aufgabe an und startet sie einmal, damit der Schlüssel entsteht.
3. **„Bearbeiten“ → Passwort für skf1** zweimal eingeben → Speichern.
   - Das Passwort wird im Tool mit dem öffentlichen Schlüssel von w3294 verschlüsselt (RSA-OAEP-256).
   - Nur der Server kann es entschlüsseln. Er legt es danach per DPAPI ab.
   - Das Passwort steht in keiner Befehlszeile, keinem Protokoll und keiner Datei im Klartext.
   - Danach prüft der Server die Anmeldung an allen Anlagen und meldet das Ergebnis in der Kachel.

### Von Hand (ohne Tool)

1. Ordner `C:\ProgramData\AMCubeSync` anlegen und die Rechte setzen:
   `icacls C:\ProgramData\AMCubeSync /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)F`
2. `AMCubeSync.ps1` und `config.example.json` als `config.json` hineinkopieren.
3. Aufgabe anlegen: als SYSTEM, stündlich und beim Start. Aktion:
   `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\ProgramData\AMCubeSync\AMCubeSync.ps1"`
4. Das Passwort lässt sich nur über das Tool setzen. Grund: Es soll nie im Klartext auf die Platte.

## Test

**Testphase:** Beim ersten Einrichten ist `targetRoot = 02_Serienproduktion_Test`. Die Kachel zeigt dann **TEST** in Orange. `02_Serienproduktion` wird in dieser Phase weder gelesen noch beschrieben. Einzige Ausnahme ist der Vergleich, und der liest nur.

**Dry-Run**
- In der Kachel über **„Probelauf“**.
- Direkt auf dem Server: `...\AMCubeSync.ps1 -DryRun` (oder `-WhatIf`). Das listet mit `robocopy /L` nur auf, was kopiert würde.

**Vor dem ersten Testlauf:** **„Speicherplatz prüfen“** zeigt die Größe der Quellordner je Anlage und vergleicht sie mit dem freien Platz.

**Vor dem Umschalten:** **„Vergleich Test ↔ Produktiv“** listet je Anlage:
- Dateien nur im Test,
- Dateien nur im Produktivordner,
- Dateien mit gleichem Namen, aber anderer Größe oder anderem Datum.

**Umschalten:** **„Produktiv schalten“** (mit Bestätigung) setzt `targetRoot = 02_Serienproduktion`. Vor dem ersten produktiven Lauf je Anlage wird der Speicherbedarf geprüft. Zurück geht es mit **„Zurück auf TEST“**.

## Fehlersuche

| Meldung in der Kachel | Bedeutung / was tun |
|---|---|
| *nicht erreichbar (wird nachgeholt)* | Port 445 der Anlage antwortet nicht. Die Anlage ist aus oder die Firewall-Regel „Zugriff von w3294“ fehlt. Kein Eingreifen nötig, wenn sie nur aus war. |
| *Anmeldung mit 550-0xsim\skf1 fehlgeschlagen* | Passwort falsch oder geändert (Windows-Code 1326). Passwort unter „Bearbeiten“ neu setzen. |
| *Konto … gesperrt / deaktiviert / Passwort abgelaufen* | Auf der Anlage das Konto skf1 prüfen. |
| *bereits eine Verbindung mit anderen Anmeldedaten* (1219) | Auf w3294 besteht schon eine andere Verbindung zur Anlage. Das Skript trennt sie vor jedem Lauf. Tritt es dauerhaft auf: `net use` auf w3294 prüfen. |
| *Freigabe … nicht gefunden* | Die Freigabe „Daten“ fehlt auf der Anlage. |
| *Zielordner voll, nur noch X GB frei* | Auf w3294 D: Platz schaffen oder `minFreeGB` anpassen. |
| *Zu wenig Speicher für den ersten Lauf* | Der Bedarf laut `robocopy /L` ist größer als der freie Platz. |
| *Freigabe „Chiron“ zeigt auf …* | `basePath` in der Konfiguration passt nicht zur Freigabe. Bewusst abgebrochen. |
| *Robocopy-Fehler 8/16: …* | Datei bzw. Ordner und Windows-Meldung stehen dahinter. Ein Klick öffnet das Protokoll. |

**Protokolle**
- Klick auf den Fehler in der Kachel, oder „Log anzeigen“ (Läufe mit Filter je Anlage, Reiter „Aktionen“).
- Auf dem Server: `C:\ProgramData\AMCubeSync\logs\`
  - `AMCubeSync_JJJJ-MM.log`: Skript-Protokoll.
  - `<Lauf>_<Anlage>_<n>.log`: robocopy-Protokolle.

**Skript von Hand starten:** `Start-ScheduledTask -TaskName AMCubeSync -TaskPath \SKF\`, oder in der Kachel „Jetzt ausführen“.

## Deinstallation

**Über das Tool:** Kachel → **„Löschen“** → Haken „Auch die geplante Aufgabe und das Skript … entfernen“.

**Von Hand auf w3294:**

```powershell
schtasks /Delete /TN "\SKF\AMCubeSync" /F
Remove-Item C:\ProgramData\AMCubeSync -Recurse -Force
# Schlüssel des Passwort-Transports entfernen (optional):
Add-Type -AssemblyName System.Core
[System.Security.Cryptography.CngKey]::Open('AMCubeSync-Passwort', [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider, [System.Security.Cryptography.CngKeyOpenOptions]::MachineKey).Delete()
```

**Die kopierten Daten unter `D:\Chiron\…` bleiben immer erhalten.**

## Sicherheit (NIS2)

- **Least Privilege:** skf1 ist auf den Anlagen ein lokaler Nicht-Admin. Die Aufgabe läuft als SYSTEM und braucht kein gespeichertes Benutzerpasswort.
- **Passwort:**
  - Es liegt nur verschlüsselt vor (DPAPI LocalMachine plus Entropie) in einer Datei, auf die nur SYSTEM und Administratoren zugreifen dürfen.
  - Es steht nie in `config.json` und nie in einem Protokoll.
  - Verbunden wird im Prozess über `WNetAddConnection2`, ohne `net use` mit dem Passwort auf der Befehlszeile. Nach jedem Lauf wird die Verbindung getrennt.
- **Firewall:** Das Tool ändert keine Firewall-Regeln.
- **Protokoll:** Alle Aktionen des Tools (Einrichten, Starten, Konfigurationsänderungen, Umschalten, Passwort gesetzt) werden mit Zeitstempel und Benutzer festgehalten, in `aktionen.jsonl` auf dem Server und auf dem Netzlaufwerk (`backups/chiron_aktionen.json`).
