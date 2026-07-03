!macro customInstall
  DetailPrint "Removing old unpacked app directory to prevent asar conflicts..."
  RMDir /r "$INSTDIR\resources\app"
!macroend
