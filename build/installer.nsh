; ── Angepasste NSIS-Logik (electron-builder) ─────────────────────────────────
; Vor der Installation eine evtl. noch laufende Instanz des Tools zwangsweise
; beenden — auch wenn sie unsichtbar im Hintergrund haengt oder von Windows
; ("Apps nach dem Neustart wiederherstellen") automatisch neu gestartet wurde.
; customInit laeuft in .onInit, also VOR der Standard-Pruefung "App laeuft noch".

!macro customInit
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "IT Admin Tool.exe" /T'
  Pop $0
  Sleep 800
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "IT Admin Tool.exe" /T'
  Pop $0
  Sleep 500
!macroend
