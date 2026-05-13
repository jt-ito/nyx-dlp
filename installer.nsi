; nyx-dlp NSIS Installer Script
Unicode True

!define APP_NAME     "nyx-dlp"
!define APP_VERSION  "1.19"
!define APP_EXE      "nyx-dlp.exe"
!define REG_KEY      "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "dist\nyx-dlp-v${APP_VERSION}-setup.exe"
InstallDir "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "${REG_KEY}" "InstallLocation"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

; Modern UI
!include "MUI2.nsh"
!include "LogicLib.nsh"
!define MUI_ABORTWARNING
!define MUI_ICON "assets\icon.ico"
!define MUI_UNICON "assets\icon.ico"

; Welcome page — show upgrade notice if already installed
!define MUI_WELCOMEPAGE_TEXT "This will install ${APP_NAME} ${APP_VERSION} on your computer.$\r$\n$\r$\nIf a previous version is already installed it will be updated automatically in the same location.$\r$\n$\r$\nClick Next to continue."

; Finish page — offer to launch the app
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; ── On init: reuse existing install dir if upgrading ──────────────
Function .onInit
  ReadRegStr $R0 HKLM "${REG_KEY}" "InstallLocation"
  ${If} $R0 != ""
    StrCpy $INSTDIR $R0
  ${EndIf}
FunctionEnd

; ── Install ────────────────────────────────────────────────────────
Section "Install"
  ; If upgrading, wipe the old app files first (keeps it clean).
  ; We preserve nothing — settings live in %AppData%, not here.
  ${If} ${FileExists} "$INSTDIR\${APP_EXE}"
    DetailPrint "Removing previous installation..."
    ; Remove old shortcuts before clearing dir
    Delete "$DESKTOP\${APP_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${APP_NAME}"
    ; Wipe old app files
    RMDir /r "$INSTDIR"
  ${EndIf}

  SetOutPath "$INSTDIR"
  File /r "dist\installer\nyx-dlp-win32-x64\*.*"

  ; Desktop shortcut
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"   "$INSTDIR\Uninstall.exe"

  ; Registry entries for Add/Remove Programs
  WriteRegStr   HKLM "${REG_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${REG_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr   HKLM "${REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKLM "${REG_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${REG_KEY}" "NoModify"        1
  WriteRegDWORD HKLM "${REG_KEY}" "NoRepair"        1

  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

; ── Uninstall ──────────────────────────────────────────────────────
Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  DeleteRegKey HKLM "${REG_KEY}"
SectionEnd
