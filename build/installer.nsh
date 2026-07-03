!macro customInstall
  DetailPrint "Removing old unpacked app directory to prevent asar conflicts..."
  IfFileExists "$INSTDIR\resources\app\*.*" 0 +2
  RMDir /r "$INSTDIR\resources\app"
!macroend
