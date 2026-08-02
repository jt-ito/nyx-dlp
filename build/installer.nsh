!macro customInit
  ; Check for and remove old custom installer (v2.0.1) in Program Files
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\nyx-dlp" "UninstallString"
  ${If} $0 != ""
    DetailPrint "Removing old v2.0.1 system-wide installation..."
    ExecWait '$0 /S _?=$PROGRAMFILES64\nyx-dlp'
  ${EndIf}

  ; Check for and remove old per-user electron-builder install in AppData
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\nyx-dlp\Uninstall nyx-dlp.exe"
    DetailPrint "Removing old per-user installation..."
    ExecWait '"$LOCALAPPDATA\Programs\nyx-dlp\Uninstall nyx-dlp.exe" /S _?=$LOCALAPPDATA\Programs\nyx-dlp'
  ${EndIf}
!macroend

!macro customInstall

!macroend
